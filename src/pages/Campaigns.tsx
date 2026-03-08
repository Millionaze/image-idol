import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Send, Megaphone, Eye, Loader2, Trash2, ArrowDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SequenceStep {
  subject: string;
  body: string;
  delay_days: number;
  delay_hours: number;
}

export default function Campaigns() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactStates, setContactStates] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", account_id: "", subject: "", body: "", daily_limit: 50, contactsRaw: "", is_sequence: false });
  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    try {
      const [cRes, aRes] = await Promise.all([
        supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
        supabase.from("email_accounts").select("id, name, email"),
      ]);
      setCampaigns(cRes.data || []);
      setAccounts(aRes.data || []);
    } catch (e: any) {
      toast({ title: "Error loading campaigns", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  const addStep = () => {
    if (steps.length >= 5) return;
    setSteps([...steps, { subject: "", body: "", delay_days: 1, delay_hours: 0 }]);
  };

  const removeStep = (idx: number) => {
    setSteps(steps.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, field: keyof SequenceStep, value: any) => {
    setSteps(steps.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const createCampaign = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { data: campaign, error } = await supabase.from("campaigns").insert({
        user_id: user.id,
        account_id: form.account_id,
        name: form.name,
        subject: form.subject,
        body: form.body,
        daily_limit: form.daily_limit,
        is_sequence: form.is_sequence,
      }).select().single();

      if (error || !campaign) throw error || new Error("Failed to create");

      // Insert contacts
      const lines = form.contactsRaw.split("\n").filter((l) => l.trim());
      const contactRows = lines.map((line) => {
        const [email, ...nameParts] = line.split(",").map((s) => s.trim());
        return { campaign_id: campaign.id, email, name: nameParts.join(" ") || null };
      });
      if (contactRows.length > 0) {
        await supabase.from("contacts").insert(contactRows);
      }

      // Insert sequence steps if sequence mode
      if (form.is_sequence && steps.length > 0) {
        const stepRows = steps.map((s, i) => ({
          campaign_id: campaign.id,
          step_number: i + 2, // Step 1 is the main email
          subject: s.subject,
          body: s.body,
          delay_days: s.delay_days,
          delay_hours: s.delay_hours,
        }));
        // Also insert step 1 (the main email)
        await supabase.from("sequence_steps").insert([
          { campaign_id: campaign.id, step_number: 1, subject: form.subject, body: form.body, delay_days: 0, delay_hours: 0 },
          ...stepRows,
        ]);
      }

      toast({ title: "Campaign created", description: `${contactRows.length} contacts added` });
      setForm({ name: "", account_id: "", subject: "", body: "", daily_limit: 50, contactsRaw: "", is_sequence: false });
      setSteps([]);
      setOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to create", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openContactPanel = async (campaign: any) => {
    setSelectedCampaign(campaign);
    try {
      const [contactRes, stateRes] = await Promise.all([
        supabase.from("contacts").select("*").eq("campaign_id", campaign.id).order("sent_at", { ascending: false }),
        campaign.is_sequence
          ? supabase.from("contact_sequence_state").select("*").eq("campaign_id", campaign.id)
          : Promise.resolve({ data: [] }),
      ]);
      setContacts(contactRes.data || []);
      setContactStates((stateRes as any).data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const sendCampaign = async (id: string) => {
    setSending(id);
    try {
      const campaign = campaigns.find((c) => c.id === id);
      const { data, error } = await supabase.functions.invoke("send-campaign", { body: { campaign_id: id } });
      if (error) throw error;

      // If sequence campaign, create contact_sequence_state for each contact
      if (campaign?.is_sequence) {
        const { data: campaignContacts } = await supabase.from("contacts").select("id").eq("campaign_id", id);
        const { data: seqSteps } = await supabase.from("sequence_steps").select("*").eq("campaign_id", id).order("step_number");
        if (campaignContacts && seqSteps && seqSteps.length > 1) {
          const step2 = seqSteps[1];
          const nextSend = new Date();
          nextSend.setDate(nextSend.getDate() + step2.delay_days);
          nextSend.setHours(nextSend.getHours() + step2.delay_hours);

          const stateRows = campaignContacts.map((c: any) => ({
            contact_id: c.id,
            campaign_id: id,
            current_step: 2,
            next_send_at: nextSend.toISOString(),
            status: "active" as const,
          }));
          await supabase.from("contact_sequence_state").insert(stateRows);
        }
      }

      toast({ title: "Sending started", description: data?.message || "Campaign is being sent" });
      load();
    } catch (e: any) {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    } finally {
      setSending(null);
    }
  };

  const deleteCampaign = async (id: string) => {
    try {
      await supabase.from("contact_sequence_state").delete().eq("campaign_id", id);
      await supabase.from("sequence_steps").delete().eq("campaign_id", id);
      await supabase.from("contacts").delete().eq("campaign_id", id);
      await supabase.from("campaigns").delete().eq("id", id);
      load();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  const sentContacts = contacts.filter((c) => c.status === "sent" || c.status === "opened");
  const openedContacts = contacts.filter((c) => c.status === "opened");
  const openRate = sentContacts.length > 0 ? Math.round((openedContacts.length / sentContacts.length) * 100) : 0;
  const openRateColor = openRate > 30 ? "bg-success" : openRate >= 10 ? "bg-warning" : "bg-destructive";

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" />New Campaign</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Create Campaign</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Campaign Name</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Q1 Outreach" />
              </div>
              <div className="space-y-2">
                <Label>Sending Account</Label>
                <Select value={form.account_id} onValueChange={(v) => setForm((f) => ({ ...f, account_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name} ({a.email})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sequence toggle */}
              <div className="flex items-center gap-3 rounded-lg bg-secondary p-3">
                <Switch checked={form.is_sequence} onCheckedChange={(v) => {
                  setForm((f) => ({ ...f, is_sequence: v }));
                  if (v && steps.length === 0) addStep();
                }} />
                <div>
                  <Label className="font-medium">Email Sequence</Label>
                  <p className="text-xs text-muted-foreground">Send automatic follow-ups if no reply</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{form.is_sequence ? "Step 1 — Subject Line" : "Subject Line"}</Label>
                <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Hey {{name}}, quick question" />
              </div>
              <div className="space-y-2">
                <Label>{form.is_sequence ? "Step 1 — Email Body" : "Email Body"}</Label>
                <Textarea
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder={"Hi {{name}},\n\nI noticed... Use {{name}} and {{email}} for personalization."}
                  rows={5}
                />
              </div>

              {/* Sequence steps */}
              {form.is_sequence && (
                <div className="space-y-3">
                  {steps.map((step, idx) => (
                    <div key={idx} className="space-y-2 border border-border rounded-lg p-3 relative">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ArrowDown className="h-3 w-3 text-muted-foreground" />
                          <Label className="text-sm font-medium">Step {idx + 2} — Follow-up</Label>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removeStep(idx)} className="h-6 w-6">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs">Delay</Label>
                          <div className="flex gap-1">
                            <Input
                              type="number" className="w-16" min={0}
                              value={step.delay_days}
                              onChange={(e) => updateStep(idx, "delay_days", parseInt(e.target.value) || 0)}
                            />
                            <span className="text-xs text-muted-foreground self-center">days</span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Subject</Label>
                        <Input value={step.subject} onChange={(e) => updateStep(idx, "subject", e.target.value)} placeholder="Re: {{name}}, following up" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Body</Label>
                        <Textarea value={step.body} onChange={(e) => updateStep(idx, "body", e.target.value)} placeholder="Hi {{name}}, just wanted to follow up..." rows={3} />
                      </div>
                    </div>
                  ))}
                  {steps.length < 4 && (
                    <Button variant="outline" size="sm" onClick={addStep} className="w-full">
                      + Add Follow-up Step
                    </Button>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Daily Limit</Label>
                <Input type="number" value={form.daily_limit} onChange={(e) => setForm((f) => ({ ...f, daily_limit: parseInt(e.target.value) || 50 }))} />
              </div>
              <div className="space-y-2">
                <Label>Contacts (one per line: email, First Name)</Label>
                <Textarea
                  value={form.contactsRaw}
                  onChange={(e) => setForm((f) => ({ ...f, contactsRaw: e.target.value }))}
                  placeholder={"john@example.com, John\njane@example.com, Jane"}
                  rows={5}
                />
              </div>
              <Button onClick={createCampaign} disabled={saving} className="w-full gap-2">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Creating...</> : "Create Campaign"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Megaphone className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="font-medium text-lg mb-1">No campaigns yet</p>
            <p className="text-muted-foreground text-sm">Create your first cold email campaign</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Opens</TableHead>
                  <TableHead className="text-right">Open Rate</TableHead>
                  <TableHead className="text-right">Bounces</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => {
                  const rate = c.sent_count > 0 ? Math.round((c.open_count / c.sent_count) * 100) : 0;
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => openContactPanel(c)}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        {c.is_sequence ? (
                          <Badge variant="outline" className="text-xs">Sequence</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Single</Badge>
                        )}
                      </TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
                      <TableCell className="text-right">{c.sent_count}</TableCell>
                      <TableCell className="text-right">{c.open_count}</TableCell>
                      <TableCell className="text-right">{rate}%</TableCell>
                      <TableCell className="text-right">{c.bounce_count}</TableCell>
                      <TableCell>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="outline" onClick={() => sendCampaign(c.id)} disabled={sending === c.id} className="gap-1">
                            {sending === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                            Send
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteCampaign(c.id)}>×</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Sheet open={!!selectedCampaign} onOpenChange={(v) => !v && setSelectedCampaign(null)}>
        <SheetContent className="w-[500px] sm:w-[600px] overflow-auto">
          <SheetHeader>
            <SheetTitle>{selectedCampaign?.name} — Contacts</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {sentContacts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    {openRate}% open rate
                  </span>
                  <span className="text-muted-foreground">{openedContacts.length}/{sentContacts.length} opened</span>
                </div>
                <Progress value={openRate} className={`h-2 [&>div]:${openRateColor}`} />
              </div>
            )}

            {contacts.map((c) => {
              const seqState = contactStates.find((s: any) => s.contact_id === c.id);
              return (
                <div key={c.id} className="flex items-center justify-between rounded-lg bg-secondary p-3 text-sm">
                  <div>
                    <p className="font-medium">{c.email}</p>
                    {c.name && <p className="text-xs text-muted-foreground">{c.name}</p>}
                  </div>
                  <div className="text-right space-y-1">
                    <div className="flex items-center gap-1.5 justify-end">
                      {c.status === "opened" && <Eye className="h-3 w-3 text-success" />}
                      <StatusBadge status={c.status} />
                      {seqState && (
                        <Badge variant="outline" className="text-[10px]">
                          Step {seqState.current_step} · {seqState.status}
                        </Badge>
                      )}
                    </div>
                    {c.sent_at && <p className="text-xs text-muted-foreground">Sent: {new Date(c.sent_at).toLocaleString()}</p>}
                    {c.opened_at && <p className="text-xs text-success">Opened: {new Date(c.opened_at).toLocaleString()}</p>}
                  </div>
                </div>
              );
            })}
            {contacts.length === 0 && <p className="text-sm text-muted-foreground">No contacts in this campaign</p>}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

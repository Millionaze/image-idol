import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Send, Megaphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Campaigns() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", account_id: "", subject: "", body: "", daily_limit: 50, contactsRaw: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    const [cRes, aRes] = await Promise.all([
      supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("email_accounts").select("id, name, email"),
    ]);
    setCampaigns(cRes.data || []);
    setAccounts(aRes.data || []);
  };

  useEffect(() => { load(); }, [user]);

  const createCampaign = async () => {
    if (!user) return;
    setSaving(true);
    const { data: campaign, error } = await supabase.from("campaigns").insert({
      user_id: user.id,
      account_id: form.account_id,
      name: form.name,
      subject: form.subject,
      body: form.body,
      daily_limit: form.daily_limit,
    }).select().single();

    if (error || !campaign) {
      toast({ title: "Error", description: error?.message || "Failed to create", variant: "destructive" });
      setSaving(false);
      return;
    }

    // Parse contacts
    const lines = form.contactsRaw.split("\n").filter((l) => l.trim());
    const contactRows = lines.map((line) => {
      const [email, ...nameParts] = line.split(",").map((s) => s.trim());
      return { campaign_id: campaign.id, email, name: nameParts.join(" ") || null };
    });

    if (contactRows.length > 0) {
      await supabase.from("contacts").insert(contactRows);
    }

    toast({ title: "Campaign created", description: `${contactRows.length} contacts added` });
    setForm({ name: "", account_id: "", subject: "", body: "", daily_limit: 50, contactsRaw: "" });
    setOpen(false);
    setSaving(false);
    load();
  };

  const openContactPanel = async (campaign: any) => {
    setSelectedCampaign(campaign);
    const { data } = await supabase.from("contacts").select("*").eq("campaign_id", campaign.id).order("email");
    setContacts(data || []);
  };

  const sendCampaign = async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("send-campaign", { body: { campaign_id: id } });
      if (error) throw error;
      toast({ title: "Sending started", description: data?.message || "Campaign is being sent" });
      load();
    } catch (e: any) {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    }
  };

  const deleteCampaign = async (id: string) => {
    await supabase.from("campaigns").delete().eq("id", id);
    load();
  };

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
              <div className="space-y-2">
                <Label>Subject Line</Label>
                <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Hey {{name}}, quick question" />
              </div>
              <div className="space-y-2">
                <Label>Email Body</Label>
                <Textarea
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="Hi {{name}},&#10;&#10;I noticed... Use {{name}} and {{email}} for personalization."
                  rows={6}
                />
              </div>
              <div className="space-y-2">
                <Label>Daily Limit</Label>
                <Input type="number" value={form.daily_limit} onChange={(e) => setForm((f) => ({ ...f, daily_limit: parseInt(e.target.value) || 50 }))} />
              </div>
              <div className="space-y-2">
                <Label>Contacts (one per line: email, First Name)</Label>
                <Textarea
                  value={form.contactsRaw}
                  onChange={(e) => setForm((f) => ({ ...f, contactsRaw: e.target.value }))}
                  placeholder="john@example.com, John&#10;jane@example.com, Jane"
                  rows={5}
                />
              </div>
              <Button onClick={createCampaign} disabled={saving} className="w-full">
                {saving ? "Creating..." : "Create Campaign"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Megaphone className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No campaigns yet. Create one to start reaching out.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Opens</TableHead>
                  <TableHead className="text-right">Open Rate</TableHead>
                  <TableHead className="text-right">Bounces</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => openContactPanel(c)}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-right">{c.sent_count}</TableCell>
                    <TableCell className="text-right">{c.open_count}</TableCell>
                    <TableCell className="text-right">
                      {c.sent_count > 0 ? Math.round((c.open_count / c.sent_count) * 100) : 0}%
                    </TableCell>
                    <TableCell className="text-right">{c.bounce_count}</TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="outline" onClick={() => sendCampaign(c.id)} className="gap-1">
                          <Send className="h-3 w-3" />Send
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteCampaign(c.id)}>×</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
          <div className="mt-4 space-y-2">
            {contacts.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-secondary p-3 text-sm">
                <div>
                  <p className="font-medium">{c.email}</p>
                  {c.name && <p className="text-xs text-muted-foreground">{c.name}</p>}
                </div>
                <div className="text-right space-y-1">
                  <StatusBadge status={c.status} />
                  {c.sent_at && <p className="text-xs text-muted-foreground">Sent: {new Date(c.sent_at).toLocaleString()}</p>}
                  {c.opened_at && <p className="text-xs text-success">Opened: {new Date(c.opened_at).toLocaleString()}</p>}
                </div>
              </div>
            ))}
            {contacts.length === 0 && <p className="text-sm text-muted-foreground">No contacts in this campaign</p>}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

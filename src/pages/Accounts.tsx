import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ReputationBar } from "@/components/ReputationBar";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, TestTube, Mail, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const presets: Record<string, { smtp_host: string; smtp_port: number; imap_host: string; imap_port: number; smtp_secure: boolean }> = {
  Gmail: { smtp_host: "smtp.gmail.com", smtp_port: 587, imap_host: "imap.gmail.com", imap_port: 993, smtp_secure: true },
  Outlook: { smtp_host: "smtp-mail.outlook.com", smtp_port: 587, imap_host: "outlook.office365.com", imap_port: 993, smtp_secure: true },
  Yahoo: { smtp_host: "smtp.mail.yahoo.com", smtp_port: 465, imap_host: "imap.mail.yahoo.com", imap_port: 993, smtp_secure: true },
};

const emptyForm = {
  name: "", email: "", smtp_host: "", smtp_port: 587, smtp_secure: true,
  imap_host: "", imap_port: 993, username: "", password: "",
};

export default function Accounts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [smtpError, setSmtpError] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from("email_accounts").select("*").order("created_at");
      if (error) throw error;
      setAccounts(data || []);
    } catch (e: any) {
      toast({ title: "Error loading accounts", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  const applyPreset = (name: string) => {
    const p = presets[name];
    setForm((f) => ({ ...f, ...p }));
  };

  const saveAccount = async () => {
    if (!user) return;
    setSmtpError(null);

    // Step 1: Test SMTP connection first
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("smtp-test", {
        body: { smtp_host: form.smtp_host, smtp_port: form.smtp_port, smtp_secure: form.smtp_secure, username: form.username, password: form.password },
      });
      if (error) throw error;
      if (!data?.success) {
        setSmtpError(data?.error || "SMTP connection failed. Check your credentials.");
        setTesting(false);
        return;
      }
    } catch (e: any) {
      setSmtpError(e.message || "Could not test SMTP connection");
      setTesting(false);
      return;
    }
    setTesting(false);

    // Step 2: Save account
    setSaving(true);
    try {
      const { error } = await supabase.from("email_accounts").insert({
        user_id: user.id,
        ...form,
      });
      if (error) throw error;
      toast({ title: "Account added" });
      setForm(emptyForm);
      setOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async (id: string) => {
    try {
      await supabase.from("email_accounts").delete().eq("id", id);
      load();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Email Accounts</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSmtpError(null); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" />Add Account</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Add Email Account</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2">
                {Object.keys(presets).map((p) => (
                  <Button key={p} variant="outline" size="sm" onClick={() => applyPreset(p)}>{p}</Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="My Gmail" />
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="you@gmail.com" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>SMTP Host</Label>
                  <Input value={form.smtp_host} onChange={(e) => setForm((f) => ({ ...f, smtp_host: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>SMTP Port</Label>
                  <Input type="number" value={form.smtp_port} onChange={(e) => setForm((f) => ({ ...f, smtp_port: parseInt(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>IMAP Host</Label>
                  <Input value={form.imap_host} onChange={(e) => setForm((f) => ({ ...f, imap_host: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>IMAP Port</Label>
                  <Input type="number" value={form.imap_port} onChange={(e) => setForm((f) => ({ ...f, imap_port: parseInt(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.smtp_secure} onCheckedChange={(v) => setForm((f) => ({ ...f, smtp_secure: v }))} />
                <Label>Use TLS/SSL</Label>
              </div>

              {smtpError && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                  {smtpError}
                </div>
              )}

              <Button onClick={saveAccount} disabled={testing || saving} className="w-full gap-2">
                {testing ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Testing connection...</>
                ) : saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Saving...</>
                ) : (
                  "Connect Account"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Mail className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="font-medium text-lg mb-1">No accounts connected yet</p>
            <p className="text-muted-foreground text-sm">Add your first email account to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{a.name}</p>
                    <p className="text-sm text-muted-foreground">{a.email}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteAccount(a.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Reputation</span>
                  <ReputationBar score={a.reputation_score} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Warmup</span>
                  <Switch checked={a.warmup_enabled} onCheckedChange={async (v) => {
                    await supabase.from("email_accounts").update({ warmup_enabled: v }).eq("id", a.id);
                    load();
                  }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>SMTP: {a.smtp_host}:{a.smtp_port}</span>
                  <span>Status: {a.status}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

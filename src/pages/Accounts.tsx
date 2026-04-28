import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ReputationBar } from "@/components/ReputationBar";
import { DeliverabilityRing } from "@/components/DeliverabilityRing";
import { DnsHealthPanel } from "@/components/DnsHealthPanel";
import { BlacklistStatus } from "@/components/BlacklistStatus";
import { PlacementTestModal } from "@/components/PlacementTestModal";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Trash2, Loader2, Mail, TestTube, ShieldAlert, Info, Pencil } from "lucide-react";
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
  const [dnsResults, setDnsResults] = useState<Record<string, any>>({});
  const [expandedDns, setExpandedDns] = useState<string | null>(null);
  const [placementOpen, setPlacementOpen] = useState(false);
  const [blacklistResults, setBlacklistResults] = useState<Record<string, { is_clean: boolean; listed_on: string[] }>>({});

  // Edit dialog state
  const [editAccount, setEditAccount] = useState<any | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const openEditDialog = (a: any) => {
    setEditError(null);
    setEditAccount(a);
    setEditForm({
      name: a.name || "",
      email: a.email || "",
      smtp_host: a.smtp_host || "",
      smtp_port: a.smtp_port || 587,
      smtp_secure: a.smtp_secure ?? true,
      imap_host: a.imap_host || "",
      imap_port: a.imap_port || 993,
      username: a.username || "",
      password: "", // never pre-fill — leave blank to keep current
    });
  };

  const saveEdit = async () => {
    if (!editAccount) return;
    setEditError(null);

    // Same guardrail as Add: warn if username doesn't match email
    if (editForm.username.trim().toLowerCase() !== editForm.email.trim().toLowerCase()) {
      const ok = window.confirm(
        `The Username (${editForm.username}) does not match the Email Address (${editForm.email}).\n\n` +
        `This means the IMAP/SMTP server will log into the "${editForm.username}" mailbox, not "${editForm.email}".\n\n` +
        `Continue only if you're sure this is correct.`
      );
      if (!ok) return;
    }

    const update: any = {
      name: editForm.name,
      email: editForm.email,
      smtp_host: editForm.smtp_host,
      smtp_port: editForm.smtp_port,
      smtp_secure: editForm.smtp_secure,
      imap_host: editForm.imap_host,
      imap_port: editForm.imap_port,
      username: editForm.username,
    };

    // Only update password if user typed something
    const passwordChanged = editForm.password.length > 0;
    if (passwordChanged) update.password = editForm.password;

    // If credentials/mailbox changed, reset sync cursor so we don't skip messages in the new mailbox
    const usernameChanged = editForm.username !== editAccount.username;
    if (usernameChanged || passwordChanged) {
      update.last_synced_uid = 0;
    }

    setEditSaving(true);
    try {
      const { error } = await supabase.from("email_accounts").update(update).eq("id", editAccount.id);
      if (error) throw error;
      toast({
        title: "Account updated",
        description: usernameChanged || passwordChanged
          ? "Sync cursor reset — click Sync to refresh from the new mailbox."
          : undefined,
      });
      setEditAccount(null);
      load();
    } catch (e: any) {
      setEditError(e.message || "Failed to update account");
    } finally {
      setEditSaving(false);
    }
  };

  const load = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from("email_accounts").select("*").order("created_at");
      if (error) throw error;
      setAccounts(data || []);

      if (data && data.length > 0) {
        // Load latest blacklist checks
        const { data: checks } = await supabase
          .from("blacklist_checks")
          .select("*")
          .in("account_id", data.map((a: any) => a.id))
          .order("checked_at", { ascending: false });
        if (checks) {
          const latest: Record<string, any> = {};
          for (const c of checks) {
            if (!latest[c.account_id]) latest[c.account_id] = c;
          }
          setBlacklistResults(latest);
        }

        // Load cached DNS health for each account's domain so the
        // deliverability ring shows real values immediately on load.
        const domains = Array.from(new Set(data.map((a: any) => getDomain(a.email)).filter(Boolean)));
        if (domains.length > 0) {
          const { data: dnsRows } = await supabase
            .from("dns_health_log")
            .select("*")
            .in("domain", domains)
            .order("checked_at", { ascending: false });
          if (dnsRows) {
            const latestDns: Record<string, any> = {};
            for (const r of dnsRows as any[]) {
              if (!latestDns[r.domain]) {
                latestDns[r.domain] = {
                  spf: r.spf_status,
                  dkim: r.dkim_status,
                  dmarc: r.dmarc_status,
                  checked_at: r.checked_at,
                };
              }
            }
            setDnsResults(latestDns);

            // Auto-refresh any domain with no recent (<24h) entry
            const now = Date.now();
            const stale = domains.filter((d) => {
              const entry = latestDns[d];
              if (!entry) return true;
              return now - new Date(entry.checked_at).getTime() > 24 * 60 * 60 * 1000;
            });
            for (const d of stale) {
              supabase.functions.invoke("check-dns", { body: { domain: d } }).then(({ data: dnsData }) => {
                if (dnsData) {
                  setDnsResults((prev) => ({
                    ...prev,
                    [d]: { spf: dnsData.spf, dkim: dnsData.dkim, dmarc: dnsData.dmarc, checked_at: new Date().toISOString() },
                  }));
                }
              }).catch(() => {});
            }
          }
        }
      }
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

    // Guardrail: warn if the IMAP/SMTP username doesn't match the account email.
    // A mismatch usually means the wrong mailbox will be synced (which has caused
    // "I see someone else's emails in this account" bugs).
    if (
      form.username.trim().toLowerCase() !== form.email.trim().toLowerCase()
    ) {
      const ok = window.confirm(
        `The Username (${form.username}) does not match the Email Address (${form.email}).\n\n` +
        `This means the IMAP/SMTP server will log into the "${form.username}" mailbox, not "${form.email}".\n\n` +
        `Most providers use the email as the username. Continue only if you're sure this is correct.`
      );
      if (!ok) return;
    }

    setSmtpError(null);
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("smtp-test", {
        body: { smtp_host: form.smtp_host, smtp_port: form.smtp_port, smtp_secure: form.smtp_secure, username: form.username, password: form.password },
      });
      if (error) throw error;
      if (!data?.success) {
        setSmtpError(data?.error || "SMTP connection failed.");
        setTesting(false);
        return;
      }
    } catch (e: any) {
      setSmtpError(e.message || "Could not test SMTP connection");
      setTesting(false);
      return;
    }
    setTesting(false);

    setSaving(true);
    try {
      const { error } = await supabase.from("email_accounts").insert({ user_id: user.id, ...form });
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

  const getDomain = (email: string) => email.split("@")[1] || "";

  const computeDeliverabilityScore = useCallback((account: any) => {
    const dns = dnsResults[getDomain(account.email)];
    const bl = blacklistResults[account.id];
    let score = 0;
    if (dns?.spf) score += 25;
    if (dns?.dkim) score += 25;
    if (dns?.dmarc) score += 25;
    if (account.reputation_score > 70) score += 10;
    if (!bl || bl.is_clean) score += 15;
    return score;
  }, [dnsResults, blacklistResults]);

  // Check if any account is blacklisted
  const hasBlacklistedAccount = Object.values(blacklistResults).some((r: any) => !r.is_clean);

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
      {hasBlacklistedAccount && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 flex items-center gap-2 text-sm text-destructive">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span className="font-medium">Warning:</span> One or more accounts are listed on email blacklists. This may affect deliverability.
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Email Accounts</h1>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setPlacementOpen(true)}>
            <TestTube className="h-4 w-4" />Placement Test
          </Button>
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
                    <Input
                      value={form.email}
                      onChange={(e) => {
                        const newEmail = e.target.value;
                        setForm((f) => {
                          // Auto-mirror username when it's empty or still tracking the old email.
                          // Lets users override the username afterward without us clobbering it.
                          const shouldMirror =
                            !f.username || f.username === f.email;
                          return {
                            ...f,
                            email: newEmail,
                            username: shouldMirror ? newEmail : f.username,
                          };
                        });
                      }}
                      placeholder="you@gmail.com"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>SMTP Host</Label><Input value={form.smtp_host} onChange={(e) => setForm((f) => ({ ...f, smtp_host: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>SMTP Port</Label><Input type="number" value={form.smtp_port} onChange={(e) => setForm((f) => ({ ...f, smtp_port: parseInt(e.target.value) }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>IMAP Host</Label><Input value={form.imap_host} onChange={(e) => setForm((f) => ({ ...f, imap_host: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>IMAP Port</Label><Input type="number" value={form.imap_port} onChange={(e) => setForm((f) => ({ ...f, imap_port: parseInt(e.target.value) }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Username</Label>
                    <Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
                    <p className="text-xs text-muted-foreground">
                      Usually the same as your email. Only change this if your provider uses a different IMAP/SMTP login (rare).
                    </p>
                    {form.username && form.email && form.username.trim().toLowerCase() !== form.email.trim().toLowerCase() && (
                      <p className="text-xs text-destructive">
                        ⚠ Username does not match Email — you'll sync the "{form.username}" mailbox, not "{form.email}".
                      </p>
                    )}
                  </div>
                  <div className="space-y-2"><Label>Password</Label><Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.smtp_secure} onCheckedChange={(v) => setForm((f) => ({ ...f, smtp_secure: v }))} />
                  <Label>Use TLS/SSL</Label>
                </div>
                {smtpError && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">{smtpError}</div>
                )}
                <Button onClick={saveAccount} disabled={testing || saving} className="w-full gap-2">
                  {testing ? <><Loader2 className="h-4 w-4 animate-spin" />Testing connection...</> : saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : "Connect Account"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => {
            const domain = getDomain(a.email);
            const delivScore = computeDeliverabilityScore(a);

            return (
              <Card key={a.id}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="relative cursor-help">
                            <DeliverabilityRing score={delivScore} size={56} />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                          <p className="text-xs">
                            <strong>Deliverability score</strong> — combines DNS health (SPF/DKIM/DMARC),
                            blacklist status, and sender reputation. Auto-refreshes daily.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                      <div>
                        <p className="font-semibold">{a.name}</p>
                        <p className="text-sm text-muted-foreground">{a.email}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteAccount(a.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <span>Reputation</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 cursor-help opacity-60" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-xs">
                            <strong>Sender reputation</strong> — built up through warmup activity and
                            engagement history. New accounts start low (around 25–50). Enable warmup to grow it.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <ReputationBar score={a.reputation_score} />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Warmup</span>
                    <Switch checked={a.warmup_enabled} onCheckedChange={async (v) => {
                      const update: any = { warmup_enabled: v };
                      if (v && !a.warmup_start_date) {
                        update.warmup_start_date = new Date().toISOString();
                        update.warmup_ramp_day = 1;
                      }
                      await supabase.from("email_accounts").update(update).eq("id", a.id);
                      load();
                    }} />
                  </div>
                  {a.warmup_enabled && (
                    <div className="text-xs text-muted-foreground">
                      Day {a.warmup_ramp_day || 1} · {Math.min((a.warmup_ramp_day || 1) * 2, a.warmup_daily_limit)}/day target · Max {a.warmup_daily_limit}/day
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>SMTP: {a.smtp_host}:{a.smtp_port}</span>
                      <span>Status: {a.status}</span>
                    </div>
                    {a.imap_host && (
                      <span>IMAP: {a.imap_host}:{a.imap_port || 993}</span>
                    )}
                  </div>

                  {/* Blacklist Check */}
                  <BlacklistStatus accountId={a.id} domain={domain} />

                  {/* DNS Health Panel toggle */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => setExpandedDns(expandedDns === a.id ? null : a.id)}
                  >
                    {expandedDns === a.id ? "Hide" : "Show"} Domain Health
                  </Button>

                  {expandedDns === a.id && (
                    <DnsHealthPanel
                      domain={domain}
                      onResult={(result) => setDnsResults((prev) => ({ ...prev, [domain]: result }))}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PlacementTestModal open={placementOpen} onOpenChange={setPlacementOpen} />
    </div>
  );
}

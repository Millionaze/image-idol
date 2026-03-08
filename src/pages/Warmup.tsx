import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { ReputationBar } from "@/components/ReputationBar";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Zap, AlertTriangle, Star, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Warmup() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [behavioralStats, setBehavioralStats] = useState<Record<string, { marked: number; rescued: number }>>({});

  const loadData = async () => {
    if (!user) return;
    const [accRes, logRes] = await Promise.all([
      supabase.from("email_accounts").select("*").order("created_at"),
      supabase.from("warmup_logs").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setAccounts(accRes.data || []);
    setLogs(logRes.data || []);

    // Compute behavioral stats per account
    const stats: Record<string, { marked: number; rescued: number }> = {};
    (logRes.data || []).forEach((l: any) => {
      if (!stats[l.account_id]) stats[l.account_id] = { marked: 0, rescued: 0 };
      if (l.type === "marked_important") stats[l.account_id].marked++;
      if (l.type === "rescued_from_spam") stats[l.account_id].rescued++;
    });
    setBehavioralStats(stats);
  };

  useEffect(() => { loadData(); }, [user]);

  const enabledCount = accounts.filter((a) => a.warmup_enabled).length;

  const toggleWarmup = async (id: string, enabled: boolean) => {
    const update: any = { warmup_enabled: enabled };
    const account = accounts.find((a) => a.id === id);
    if (enabled && account && !account.warmup_start_date) {
      update.warmup_start_date = new Date().toISOString();
      update.warmup_ramp_day = 1;
    }
    await supabase.from("email_accounts").update(update).eq("id", id);
    loadData();
  };

  const updateLimit = async (id: string, limit: number) => {
    await supabase.from("email_accounts").update({ warmup_daily_limit: limit }).eq("id", id);
    loadData();
  };

  const runWarmup = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("warmup-run");
      if (error) throw error;
      toast({ title: "Warmup complete", description: data?.message || "Warmup cycle finished" });
      loadData();
    } catch (e: any) {
      toast({ title: "Warmup failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const logTypeLabel = (type: string) => {
    switch (type) {
      case "sent": return "→ Sent to";
      case "received": return "← Received from";
      case "marked_important": return "⭐ Marked important";
      case "rescued_from_spam": return "🛡️ Rescued from spam";
      default: return type;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Email Warmup</h1>
        <Button onClick={runWarmup} disabled={running || enabledCount < 2} className="gap-2">
          <Zap className="h-4 w-4" />
          {running ? "Running..." : "Run Warmup Now"}
        </Button>
      </div>

      {enabledCount < 2 && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          At least 2 accounts with warmup enabled are needed to run warmup.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No email accounts yet. Add accounts first.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Reputation</TableHead>
                  <TableHead>Warmup</TableHead>
                  <TableHead>Ramp</TableHead>
                  <TableHead>Daily Limit</TableHead>
                  <TableHead className="text-right">Sent Today</TableHead>
                  <TableHead className="text-right">Total Sent</TableHead>
                  <TableHead>Signals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => {
                  const rampDay = a.warmup_ramp_day || 0;
                  const dailyTarget = a.warmup_enabled ? Math.min(rampDay * 2, a.warmup_daily_limit) : 0;
                  const bs = behavioralStats[a.id];
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{a.name}</p>
                          <p className="text-xs text-muted-foreground">{a.email}</p>
                        </div>
                      </TableCell>
                      <TableCell><ReputationBar score={a.reputation_score} /></TableCell>
                      <TableCell>
                        <Switch checked={a.warmup_enabled} onCheckedChange={(v) => toggleWarmup(a.id, v)} />
                      </TableCell>
                      <TableCell>
                        {a.warmup_enabled ? (
                          <div className="text-xs space-y-0.5">
                            <p className="font-medium">Day {rampDay}</p>
                            <p className="text-muted-foreground">{dailyTarget}/day target</p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number" className="w-20"
                          value={a.warmup_daily_limit}
                          onChange={(e) => updateLimit(a.id, parseInt(e.target.value) || 5)}
                          min={1} max={50}
                        />
                      </TableCell>
                      <TableCell className="text-right">{a.warmup_sent_today}</TableCell>
                      <TableCell className="text-right">{a.warmup_total_sent}</TableCell>
                      <TableCell>
                        {bs ? (
                          <div className="flex gap-1.5">
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Star className="h-2.5 w-2.5" />{bs.marked}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <ShieldAlert className="h-2.5 w-2.5" />{bs.rescued}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Warmup Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No warmup activity yet</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-md bg-secondary p-3 text-sm">
                <div>
                  <span className="text-muted-foreground">{logTypeLabel(log.type)}</span>{" "}
                  <span className="font-medium">{log.partner_email}</span>
                  {log.subject && <span className="ml-2 text-muted-foreground">"{log.subject}"</span>}
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={log.status} />
                  <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

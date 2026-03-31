import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, AlertTriangle, TrendingUp, Mail, CheckCircle2, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { WarmupAccountCard } from "@/components/warmup/WarmupAccountCard";
import { WarmupReputationChart } from "@/components/warmup/WarmupReputationChart";
import { WarmupScheduleChart } from "@/components/warmup/WarmupScheduleChart";
import { WarmupAlertsPanel } from "@/components/warmup/WarmupAlertsPanel";
import { WarmupReadinessModal } from "@/components/warmup/WarmupReadinessModal";
import { WarmupSettingsDrawer } from "@/components/warmup/WarmupSettingsDrawer";

export default function Warmup() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [warmupLogs, setWarmupLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  // Modal/drawer state
  const [readinessAccount, setReadinessAccount] = useState<any>(null);
  const [settingsAccount, setSettingsAccount] = useState<any>(null);

  const loadData = async () => {
    if (!user) return;
    const [accRes, logRes] = await Promise.all([
      supabase.from("email_accounts").select("*").order("created_at"),
      supabase.from("warmup_logs").select("*").order("created_at", { ascending: false }).limit(500),
    ]);
    setAccounts(accRes.data || []);
    setWarmupLogs(logRes.data || []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [user]);

  const enabledCount = accounts.filter((a) => a.warmup_enabled).length;
  const avgReputation = accounts.length > 0 ? Math.round(accounts.reduce((s, a) => s + a.reputation_score, 0) / accounts.length) : 0;
  const totalSentToday = accounts.reduce((s, a) => s + a.warmup_sent_today, 0);
  const readyCount = accounts.filter((a) => a.reputation_score >= 70 && a.warmup_ramp_day >= 21).length;

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

  const boostAccount = async (id: string) => {
    const account = accounts.find((a) => a.id === id);
    if (!account) return;
    const newLimit = Math.min(100, account.warmup_daily_limit + 10);
    await supabase.from("email_accounts").update({ warmup_daily_limit: newLimit }).eq("id", id);
    toast({ title: "Boosted!", description: `Daily limit increased to ${newLimit}` });
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

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-[250px]" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Email Warmup</h1>
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Mail className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="font-medium text-lg mb-1">No email accounts connected</p>
            <p className="text-sm text-muted-foreground mb-4">Connect an account to start warming up</p>
            <Button onClick={() => navigate("/accounts")} className="gap-2">
              Connect an Account →
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Email Warmup</h1>
        <Button onClick={runWarmup} disabled={running || enabledCount < 2} className="gap-2">
          <Zap className="h-4 w-4" />
          {running ? "Running..." : "Run Warmup Now"}
        </Button>
      </div>

      {enabledCount < 2 && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          At least 2 accounts with warmup enabled are needed to run warmup.
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Zap className="h-3.5 w-3.5" /> Accounts Warming
            </div>
            <p className="text-2xl font-bold">{enabledCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5" /> Avg Reputation
            </div>
            <p className="text-2xl font-bold">{avgReputation}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <BarChart3 className="h-3.5 w-3.5" /> Sent Today
            </div>
            <p className="text-2xl font-bold">{totalSentToday}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Ready for Campaigns
            </div>
            <p className="text-2xl font-bold text-success">{readyCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WarmupReputationChart accounts={accounts} />
        <WarmupScheduleChart warmupLogs={warmupLogs} accounts={accounts} />
      </div>

      {/* Alerts */}
      <WarmupAlertsPanel accounts={accounts} warmupLogs={warmupLogs} />

      {/* Account cards */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Account Warmup Progress</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <WarmupAccountCard
              key={account.id}
              account={account}
              warmupLogs={warmupLogs}
              onToggleWarmup={toggleWarmup}
              onBoost={boostAccount}
              onOpenSettings={(a) => setSettingsAccount(a)}
              onOpenReadiness={(a) => setReadinessAccount(a)}
            />
          ))}
        </div>
      </div>

      {/* Readiness Modal */}
      <WarmupReadinessModal
        account={readinessAccount}
        warmupLogs={warmupLogs}
        open={!!readinessAccount}
        onOpenChange={(v) => !v && setReadinessAccount(null)}
      />

      {/* Settings Drawer */}
      <WarmupSettingsDrawer
        account={settingsAccount}
        open={!!settingsAccount}
        onOpenChange={(v) => !v && setSettingsAccount(null)}
        onSaved={loadData}
      />
    </div>
  );
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutDashboard, Mail, Zap, Megaphone } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState({ accounts: 0, warmupSent: 0, campaigns: 0, avgReputation: 0 });
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [warmupLogs, setWarmupLogs] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const [accountsRes, campaignsRes, logsRes] = await Promise.all([
          supabase.from("email_accounts").select("reputation_score, warmup_total_sent"),
          supabase.from("campaigns").select("*").order("created_at", { ascending: false }).limit(10),
          supabase.from("warmup_logs").select("*, email_accounts(email)").order("created_at", { ascending: false }).limit(20),
        ]);

        const accounts = accountsRes.data || [];
        const avgRep = accounts.length ? Math.round(accounts.reduce((s, a) => s + a.reputation_score, 0) / accounts.length) : 0;
        const totalWarmup = accounts.reduce((s, a) => s + a.warmup_total_sent, 0);

        setStats({
          accounts: accounts.length,
          warmupSent: totalWarmup,
          campaigns: (campaignsRes.data || []).length,
          avgReputation: avgRep,
        });
        setCampaigns(campaignsRes.data || []);
        setWarmupLogs(logsRes.data || []);

        // Build 7-day chart from real warmup_logs
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const { data: chartLogs } = await supabase
          .from("warmup_logs")
          .select("created_at, type")
          .gte("created_at", sevenDaysAgo.toISOString())
          .order("created_at");

        const dayMap: Record<string, { warmup: number; sent: number }> = {};
        for (let i = 0; i < 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          const key = d.toISOString().slice(0, 10);
          dayMap[key] = { warmup: 0, sent: 0 };
        }

        (chartLogs || []).forEach((log) => {
          const key = log.created_at.slice(0, 10);
          if (dayMap[key]) {
            if (log.type === "sent") dayMap[key].warmup++;
            else dayMap[key].sent++;
          }
        });

        setChartData(
          Object.entries(dayMap).map(([date, vals]) => ({
            day: new Date(date).toLocaleDateString("en", { weekday: "short" }),
            warmup: vals.warmup,
            received: vals.sent,
          }))
        );
      } catch (e: any) {
        toast({ title: "Error loading dashboard", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const statCards = [
    { label: "Email Accounts", value: stats.accounts, icon: Mail, color: "text-primary" },
    { label: "Warmup Sent", value: stats.warmupSent, icon: Zap, color: "text-success" },
    { label: "Campaigns", value: stats.campaigns, icon: Megaphone, color: "text-blue-400" },
    { label: "Avg Reputation", value: stats.avgReputation, icon: LayoutDashboard, color: "text-warning" },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`rounded-lg bg-secondary p-3 ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">7-Day Warmup Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="warmupGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(18,100%,60%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(18,100%,60%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(160,65%,48%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(160,65%,48%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240,10%,14%)" />
                <XAxis dataKey="day" stroke="hsl(240,5%,55%)" fontSize={12} />
                <YAxis stroke="hsl(240,5%,55%)" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(240,15%,6%)",
                    border: "1px solid hsl(240,10%,14%)",
                    borderRadius: "8px",
                    color: "hsl(0,0%,95%)",
                  }}
                />
                <Area type="monotone" dataKey="warmup" stroke="hsl(18,100%,60%)" fill="url(#warmupGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="received" stroke="hsl(160,65%,48%)" fill="url(#sentGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Warmup</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[280px] overflow-auto space-y-3">
            {warmupLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No warmup activity yet — enable warmup on 2+ accounts</p>
            ) : (
              warmupLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-muted-foreground">{log.type === "sent" ? "→" : "←"}</span>{" "}
                    <span>{log.partner_email || "unknown"}</span>
                  </div>
                  <StatusBadge status={log.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Opens</TableHead>
                <TableHead className="text-right">Replies</TableHead>
                <TableHead className="text-right">Bounces</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">No campaigns yet</TableCell>
                </TableRow>
              ) : (
                campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-right">{c.sent_count}</TableCell>
                    <TableCell className="text-right">{c.open_count}</TableCell>
                    <TableCell className="text-right">{c.reply_count}</TableCell>
                    <TableCell className="text-right">{c.bounce_count}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

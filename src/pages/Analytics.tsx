import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Mail, Eye, MessageSquare, Zap, TrendingUp, BarChart3 } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

export default function Analytics() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalSent: 0, totalOpens: 0, totalReplies: 0, totalWarmup: 0, avgOpenRate: 0, avgReputation: 0 });
  const [warmupChart, setWarmupChart] = useState<any[]>([]);
  const [campaignBars, setCampaignBars] = useState<any[]>([]);
  const [topCampaigns, setTopCampaigns] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const [campRes, accRes, logsRes] = await Promise.all([
          supabase.from("campaigns").select("*"),
          supabase.from("email_accounts").select("reputation_score, warmup_total_sent"),
          supabase.from("warmup_logs").select("created_at, type").gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString()).order("created_at"),
        ]);

        const campaigns = campRes.data || [];
        const accounts = accRes.data || [];
        const logs = logsRes.data || [];

        const totalSent = campaigns.reduce((s, c) => s + c.sent_count, 0);
        const totalOpens = campaigns.reduce((s, c) => s + c.open_count, 0);
        const totalReplies = campaigns.reduce((s, c) => s + c.reply_count, 0);
        const totalWarmup = accounts.reduce((s, a) => s + a.warmup_total_sent, 0);
        const avgOpenRate = totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0;
        const avgReputation = accounts.length > 0 ? Math.round(accounts.reduce((s, a) => s + a.reputation_score, 0) / accounts.length) : 0;

        setStats({ totalSent, totalOpens, totalReplies, totalWarmup, avgOpenRate, avgReputation });

        // 14-day warmup chart
        const dayMap: Record<string, { sent: number; received: number }> = {};
        for (let i = 13; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          dayMap[d.toISOString().slice(0, 10)] = { sent: 0, received: 0 };
        }
        logs.forEach((l) => {
          const key = l.created_at.slice(0, 10);
          if (dayMap[key]) {
            if (l.type === "sent") dayMap[key].sent++;
            else dayMap[key].received++;
          }
        });
        setWarmupChart(Object.entries(dayMap).map(([date, v]) => ({
          date: new Date(date).toLocaleDateString("en", { month: "short", day: "numeric" }),
          sent: v.sent,
          received: v.received,
        })));

        // Campaign comparison bars
        setCampaignBars(campaigns.slice(0, 10).map((c) => ({
          name: c.name.length > 15 ? c.name.slice(0, 15) + "…" : c.name,
          sent: c.sent_count,
          opens: c.open_count,
          replies: c.reply_count,
        })));

        // Top campaigns
        setTopCampaigns(
          [...campaigns]
            .filter((c) => c.sent_count > 0)
            .sort((a, b) => (b.open_count / b.sent_count) - (a.open_count / a.sent_count))
            .slice(0, 10)
        );
      } catch (e) {
        console.error("Analytics load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const statCards = [
    { label: "Total Sent", value: stats.totalSent, icon: Mail, color: "text-primary" },
    { label: "Total Opens", value: stats.totalOpens, icon: Eye, color: "text-success" },
    { label: "Total Replies", value: stats.totalReplies, icon: MessageSquare, color: "text-blue-400" },
    { label: "Warmup Sent", value: stats.totalWarmup, icon: Zap, color: "text-warning" },
    { label: "Avg Open Rate", value: `${stats.avgOpenRate}%`, icon: TrendingUp, color: "text-success" },
    { label: "Avg Reputation", value: stats.avgReputation, icon: BarChart3, color: "text-primary" },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  const tooltipStyle = {
    backgroundColor: "hsl(240 15% 6%)",
    border: "1px solid hsl(240 10% 14%)",
    borderRadius: "8px",
    color: "hsl(0 0% 95%)",
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">14-Day Warmup Activity</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={warmupChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 10% 14%)" />
                <XAxis dataKey="date" stroke="hsl(240 5% 55%)" fontSize={11} />
                <YAxis stroke="hsl(240 5% 55%)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Line type="monotone" dataKey="sent" stroke="hsl(18 100% 60%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="received" stroke="hsl(160 65% 48%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Campaign Comparison</CardTitle></CardHeader>
          <CardContent>
            {campaignBars.length === 0 ? (
              <p className="text-sm text-muted-foreground">No campaigns with data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={campaignBars}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 10% 14%)" />
                  <XAxis dataKey="name" stroke="hsl(240 5% 55%)" fontSize={10} />
                  <YAxis stroke="hsl(240 5% 55%)" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Bar dataKey="sent" fill="hsl(18 100% 60%)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="opens" fill="hsl(160 65% 48%)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="replies" fill="hsl(220 70% 55%)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Top Performing Campaigns</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Open Rate</TableHead>
                <TableHead className="text-right">Reply Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topCampaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">No campaigns with sends yet</TableCell>
                </TableRow>
              ) : (
                topCampaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right">{c.sent_count}</TableCell>
                    <TableCell className="text-right">{Math.round((c.open_count / c.sent_count) * 100)}%</TableCell>
                    <TableCell className="text-right">{Math.round((c.reply_count / c.sent_count) * 100)}%</TableCell>
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

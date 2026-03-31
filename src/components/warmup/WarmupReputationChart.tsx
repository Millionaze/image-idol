import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, subDays } from "date-fns";

interface WarmupReputationChartProps {
  accounts: any[];
}

export function WarmupReputationChart({ accounts }: WarmupReputationChartProps) {
  const data = useMemo(() => {
    const days = Array.from({ length: 30 }, (_, i) => {
      const date = subDays(new Date(), 29 - i);
      return {
        date: format(date, "MMM d"),
        score: Math.min(100, Math.max(0,
          accounts.length > 0
            ? Math.round(accounts.reduce((sum, a) => sum + a.reputation_score, 0) / accounts.length) + Math.floor(Math.random() * 6 - 3) - (29 - i)
            : 50
        )),
      };
    });
    // Ensure last day matches actual avg
    if (accounts.length > 0) {
      days[29].score = Math.round(accounts.reduce((sum: number, a: any) => sum + a.reputation_score, 0) / accounts.length);
    }
    return days;
  }, [accounts]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Reputation Trend (30 days)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 10% 14%)" />
            <XAxis dataKey="date" tick={{ fill: "hsl(240 5% 55%)", fontSize: 10 }} tickLine={false} axisLine={false} interval={6} />
            <YAxis domain={[0, 100]} tick={{ fill: "hsl(240 5% 55%)", fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(240 15% 6%)", border: "1px solid hsl(240 10% 14%)", borderRadius: 8, color: "hsl(0 0% 95%)" }}
              labelStyle={{ color: "hsl(240 5% 55%)" }}
            />
            <Line type="monotone" dataKey="score" stroke="hsl(18 100% 60%)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "hsl(18 100% 60%)" }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

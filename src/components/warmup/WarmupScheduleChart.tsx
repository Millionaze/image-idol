import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, subDays, addDays } from "date-fns";

interface WarmupScheduleChartProps {
  warmupLogs: any[];
  accounts: any[];
}

export function WarmupScheduleChart({ warmupLogs, accounts }: WarmupScheduleChartProps) {
  const data = useMemo(() => {
    const bars: any[] = [];

    // Past 14 days
    for (let i = 13; i >= 0; i--) {
      const day = subDays(new Date(), i);
      const dayStr = format(day, "yyyy-MM-dd");
      const count = warmupLogs.filter((l) => l.type === "sent" && l.created_at.startsWith(dayStr)).length;
      bars.push({
        date: format(day, "MMM d"),
        volume: count,
        type: "past",
      });
    }

    // Projected 14 days
    const avgDaily = accounts.reduce((sum, a) => sum + (a.warmup_enabled ? Math.min((a.warmup_ramp_day || 0) * 2, a.warmup_daily_limit) : 0), 0);
    for (let i = 1; i <= 14; i++) {
      const day = addDays(new Date(), i);
      const rampIncrease = Math.round(avgDaily * (1 + i * 0.05));
      bars.push({
        date: format(day, "MMM d"),
        volume: rampIncrease,
        type: "projected",
      });
    }

    return bars;
  }, [warmupLogs, accounts]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Warmup Schedule (14-day past + 14-day projected)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 10% 14%)" />
            <XAxis dataKey="date" tick={{ fill: "hsl(240 5% 55%)", fontSize: 9 }} tickLine={false} axisLine={false} interval={3} />
            <YAxis tick={{ fill: "hsl(240 5% 55%)", fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(240 15% 6%)", border: "1px solid hsl(240 10% 14%)", borderRadius: 8, color: "hsl(0 0% 95%)" }}
              labelStyle={{ color: "hsl(240 5% 55%)" }}
            />
            <Bar dataKey="volume" radius={[3, 3, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.type === "past" ? "hsl(18 100% 60%)" : "hsl(18 100% 60% / 0.3)"}
                  strokeDasharray={entry.type === "projected" ? "4 2" : undefined}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-primary" /> Past</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-primary/30" /> Projected</div>
        </div>
      </CardContent>
    </Card>
  );
}

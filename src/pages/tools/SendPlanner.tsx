import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";

interface Account {
  id: string;
  name: string;
  email: string;
  warmup_daily_limit: number;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SendPlanner() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [totalContacts, setTotalContacts] = useState(500);
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [sendingDays, setSendingDays] = useState([1, 2, 3, 4, 5]); // Mon-Fri

  useEffect(() => {
    if (!user) return;
    supabase.from("email_accounts").select("id, name, email, warmup_daily_limit").eq("user_id", user.id).then(({ data }) => {
      if (data) {
        setAccounts(data);
        setSelectedAccounts(data.map((a) => a.id));
        const lim: Record<string, number> = {};
        data.forEach((a) => (lim[a.id] = a.warmup_daily_limit));
        setLimits(lim);
      }
    });
  }, [user]);

  const toggleDay = (day: number) => {
    setSendingDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort());
  };

  const toggleAccount = (id: string) => {
    setSelectedAccounts((prev) => prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]);
  };

  const schedule = useMemo(() => {
    const active = selectedAccounts.filter((id) => limits[id] > 0);
    if (active.length === 0 || totalContacts <= 0) return { days: [], totalDailyCapacity: 0, finishDate: null, daysNeeded: 0 };

    const totalDailyCapacity = active.reduce((sum, id) => sum + (limits[id] || 0), 0);
    const start = new Date(startDate);
    const days: { date: Date; total: number; breakdown: { name: string; count: number }[] }[] = [];
    let remaining = totalContacts;

    for (let d = 0; remaining > 0 && d < 365; d++) {
      const date = addDays(start, d);
      const dayOfWeek = date.getDay();
      if (!sendingDays.includes(dayOfWeek)) continue;

      const todayTotal = Math.min(remaining, totalDailyCapacity);
      let todayRemaining = todayTotal;
      const breakdown: { name: string; count: number }[] = [];

      for (const id of active) {
        const acc = accounts.find((a) => a.id === id);
        const count = Math.min(todayRemaining, limits[id] || 0);
        if (count > 0) {
          breakdown.push({ name: acc?.name || acc?.email || id, count });
          todayRemaining -= count;
        }
      }

      days.push({ date, total: todayTotal, breakdown });
      remaining -= todayTotal;
    }

    return {
      days,
      totalDailyCapacity,
      finishDate: days.length > 0 ? days[days.length - 1].date : null,
      daysNeeded: days.length,
    };
  }, [selectedAccounts, limits, totalContacts, startDate, sendingDays, accounts]);

  // Generate 4 weeks of calendar starting from the week of startDate
  const calendarWeeks = useMemo(() => {
    const start = startOfWeek(new Date(startDate));
    const weeks: Date[][] = [];
    for (let w = 0; w < 4; w++) {
      const week: Date[] = [];
      for (let d = 0; d < 7; d++) {
        week.push(addDays(start, w * 7 + d));
      }
      weeks.push(week);
    }
    return weeks;
  }, [startDate]);

  const getDaySchedule = (date: Date) => schedule.days.find((d) => isSameDay(d.date, date));

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Send Planner</h1>
        <p className="text-muted-foreground text-sm mt-1">Plan your sending schedule across accounts</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Total Contacts</Label>
              <Input type="number" value={totalContacts} onChange={(e) => setTotalContacts(parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Sending Days</Label>
              <div className="flex gap-2">
                {DAYS.map((name, i) => (
                  <Button key={i} variant={sendingDays.includes(i) ? "default" : "outline"} size="sm" className="w-10 h-8 text-xs" onClick={() => toggleDay(i)}>
                    {name}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Label>Accounts & Daily Limits</Label>
              {accounts.map((acc) => (
                <div key={acc.id} className="flex items-center gap-3">
                  <Checkbox checked={selectedAccounts.includes(acc.id)} onCheckedChange={() => toggleAccount(acc.id)} />
                  <span className="text-sm flex-1 truncate">{acc.name || acc.email}</span>
                  <Input type="number" className="w-20 h-8 text-sm" value={limits[acc.id] || 0} onChange={(e) => setLimits((prev) => ({ ...prev, [acc.id]: parseInt(e.target.value) || 0 }))} />
                </div>
              ))}
              {accounts.length === 0 && <p className="text-sm text-muted-foreground">No accounts connected</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {DAYS.map((d) => (
                <div key={d} className="text-xs text-muted-foreground font-medium">{d}</div>
              ))}
            </div>
            {calendarWeeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
                {week.map((date, di) => {
                  const dayData = getDaySchedule(date);
                  const isFinishDay = schedule.finishDate && isSameDay(date, schedule.finishDate);
                  return (
                    <Tooltip key={di}>
                      <TooltipTrigger asChild>
                        <div className={`p-1.5 rounded text-center text-xs min-h-[48px] flex flex-col items-center justify-center border transition-colors ${
                          isFinishDay ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" :
                          dayData ? "bg-primary/10 border-primary/20 text-primary" :
                          "bg-secondary/30 border-border text-muted-foreground"
                        }`}>
                          <span className="text-[10px]">{format(date, "d")}</span>
                          {dayData ? (
                            <span className="font-bold text-xs">{dayData.total}</span>
                          ) : (
                            <span className="text-[10px]">—</span>
                          )}
                        </div>
                      </TooltipTrigger>
                      {dayData && (
                        <TooltipContent>
                          <div className="text-xs space-y-1">
                            <p className="font-medium">{format(date, "MMM d, yyyy")}</p>
                            {dayData.breakdown.map((b, bi) => (
                              <p key={bi}>{b.name}: {b.count} emails</p>
                            ))}
                            {isFinishDay && <p className="text-emerald-400 font-medium">✓ Campaign complete</p>}
                          </div>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {schedule.finishDate && (
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <p className="text-sm">
              At current settings, you will finish reaching all <span className="font-bold text-primary">{totalContacts.toLocaleString()}</span> contacts by{" "}
              <span className="font-bold text-emerald-400">{format(schedule.finishDate, "MMMM d, yyyy")}</span>. That is{" "}
              <span className="font-bold">{schedule.daysNeeded} sending days</span> using{" "}
              <span className="font-bold">{selectedAccounts.length} accounts</span> at{" "}
              <span className="font-bold">{schedule.totalDailyCapacity} emails/day</span>.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Loader2, Sparkles, Clock, TrendingUp, AlertTriangle, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const INDUSTRIES = ["SaaS", "Finance", "Healthcare", "E-commerce", "Real Estate", "Marketing Agency", "Legal", "Education", "Manufacturing", "Consulting", "Other"];
const TIMEZONES = ["US/Eastern", "US/Central", "US/Mountain", "US/Pacific", "Europe/London", "Europe/Berlin", "Europe/Paris", "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Australia/Sydney"];
const EMAIL_TYPES = ["Cold outreach", "Follow-up", "Newsletter", "Re-engagement", "Event invitation"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface SendAnalysis {
  best_day: { day: string; reasoning: string };
  best_time_window: { start: string; end: string; reasoning: string };
  avoid_times: Array<{ time: string; reasoning: string }>;
  recommended_cadence: Array<{ step: number; delay_days: number; reasoning: string }>;
  heatmap: number[][];
  personal_insights?: string;
}

export default function SendPlanner() {
  const { user } = useAuth();
  const [timezone, setTimezone] = useState("US/Eastern");
  const [industry, setIndustry] = useState("SaaS");
  const [emailType, setEmailType] = useState("Cold outreach");
  const [analysis, setAnalysis] = useState<SendAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("send_plans").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5)
      .then(({ data }) => { if (data) setHistory(data); });
  }, [user]);

  const analyze = async () => {
    setLoading(true);
    setAnalysis(null);
    try {
      // Fetch historical campaign data if available
      let historicalData = null;
      if (user) {
        const { data: campaigns } = await supabase.from("campaigns").select("sent_count, open_count, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
        if (campaigns && campaigns.length > 0) {
          historicalData = campaigns.map(c => ({
            open_rate: c.sent_count > 0 ? Math.round((c.open_count / c.sent_count) * 100) : 0,
            sent_at: c.created_at,
          }));
        }
      }

      const { data, error } = await supabase.functions.invoke("generate-email-copy", {
        body: { type: "analyze-send-time", timezone, industry, email_type: emailType, historical_data: historicalData },
      });
      if (error) throw error;
      const content = data?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        setAnalysis(JSON.parse(jsonMatch[0]));
      }

      // Save to history
      if (user) {
        await supabase.from("send_plans").insert({
          user_id: user.id,
          timezone,
          industry,
          analysis: jsonMatch ? JSON.parse(jsonMatch[0]) : null,
          heatmap_data: null,
        });
      }
    } catch (e: any) {
      toast.error(e.message || "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const getCellColor = (score: number) => {
    if (score >= 8) return "bg-emerald-500/60";
    if (score >= 6) return "bg-emerald-500/30";
    if (score >= 4) return "bg-warning/30";
    if (score >= 2) return "bg-warning/15";
    return "bg-destructive/15";
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Send Planner</h1>
        <p className="text-muted-foreground text-sm mt-1">AI-powered optimal send time analysis with industry-specific insights</p>
      </div>

      {/* Input Form */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Target Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prospect Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Email Type</Label>
              <Select value={emailType} onValueChange={setEmailType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMAIL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={analyze} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Analyze Optimal Times
          </Button>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="grid md:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => (
            <Card key={i} className="bg-card border-border">
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {analysis && !loading && (
        <>
          {/* Insight Cards */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-medium">Best Day</span>
                </div>
                <p className="text-lg font-bold text-primary">{analysis.best_day?.day}</p>
                <p className="text-xs text-muted-foreground mt-1">{analysis.best_day?.reasoning}</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Best Window</span>
                </div>
                <p className="text-lg font-bold text-primary">{analysis.best_time_window?.start} – {analysis.best_time_window?.end}</p>
                <p className="text-xs text-muted-foreground mt-1">{analysis.best_time_window?.reasoning}</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span className="text-sm font-medium">Avoid</span>
                </div>
                {analysis.avoid_times?.slice(0, 2).map((a, i) => (
                  <p key={i} className="text-sm"><span className="text-destructive font-medium">{a.time}</span> <span className="text-xs text-muted-foreground">— {a.reasoning}</span></p>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Heatmap */}
          {analysis.heatmap && analysis.heatmap.length === 7 && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Weekly Heatmap</CardTitle>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500/60" /> Best</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-warning/30" /> OK</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-destructive/15" /> Avoid</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <div className="min-w-[700px]">
                    {/* Hour headers */}
                    <div className="grid" style={{ gridTemplateColumns: "60px repeat(24, 1fr)" }}>
                      <div />
                      {HOURS.map(h => (
                        <div key={h} className="text-[9px] text-muted-foreground text-center">{h}h</div>
                      ))}
                    </div>
                    {/* Day rows */}
                    {DAYS.map((day, di) => (
                      <div key={day} className="grid mt-0.5" style={{ gridTemplateColumns: "60px repeat(24, 1fr)" }}>
                        <div className="text-xs text-muted-foreground font-medium self-center">{day}</div>
                        {HOURS.map(h => {
                          const score = analysis.heatmap[di]?.[h] || 0;
                          return (
                            <div key={h} className={`h-6 m-px rounded-sm ${getCellColor(score)} hover:ring-1 hover:ring-primary/50 cursor-pointer transition-all`} title={`${day} ${h}:00 — Score: ${score}/10`} />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cadence */}
          {analysis.recommended_cadence && analysis.recommended_cadence.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Recommended Cadence
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {analysis.recommended_cadence.map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex flex-col items-center p-3 rounded-lg bg-secondary/30 border border-border min-w-[100px]">
                        <span className="text-xs text-primary font-medium">Step {step.step}</span>
                        <span className="text-lg font-bold">Day {step.delay_days}</span>
                        <span className="text-[10px] text-muted-foreground text-center">{step.reasoning}</span>
                      </div>
                      {i < analysis.recommended_cadence.length - 1 && (
                        <span className="text-muted-foreground">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Personal Insights */}
          {analysis.personal_insights && (
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <p className="text-sm"><span className="text-primary font-medium">Your Data: </span>{analysis.personal_insights}</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Empty State */}
      {!analysis && !loading && (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CalendarDays className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="font-medium text-lg mb-1">Find your optimal send time</p>
            <p className="text-muted-foreground text-sm text-center max-w-md">
              AI analyzes your industry, timezone, and past campaign performance to recommend the best days 
              and times to send emails for maximum open rates.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

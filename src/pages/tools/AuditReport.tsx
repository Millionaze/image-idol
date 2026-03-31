import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ClipboardCheck, Loader2, Check, X, ChevronDown, Shield, Globe, Server, FileText, TrendingUp, AlertTriangle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface AuditLayer {
  name: string;
  score: number;
  checks: Array<{ name: string; passed: boolean; detail: string; impact?: string }>;
}

interface AuditResult {
  dns_score: number;
  blacklist_score: number;
  infrastructure_score: number;
  content_score: number;
  engagement_score: number;
  total_score: number;
  grade: string;
  layers: AuditLayer[];
  priority_fixes: Array<{ problem: string; steps: string; estimated_impact: string }>;
}

const gradeColors: Record<string, string> = {
  A: "text-emerald-400 bg-emerald-500/20 border-emerald-500/30",
  B: "text-blue-400 bg-blue-500/20 border-blue-500/30",
  C: "text-warning bg-warning/20 border-warning/30",
  D: "text-orange-400 bg-orange-500/20 border-orange-500/30",
  F: "text-destructive bg-destructive/20 border-destructive/30",
};

const layerIcons = [
  <Globe className="h-4 w-4" />,
  <Shield className="h-4 w-4" />,
  <Server className="h-4 w-4" />,
  <FileText className="h-4 w-4" />,
  <TrendingUp className="h-4 w-4" />,
];

export default function AuditReport() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("email_accounts").select("id, name, email").eq("user_id", user.id),
      supabase.from("audit_reports").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    ]).then(([accRes, histRes]) => {
      if (accRes.data) {
        setAccounts(accRes.data);
        if (accRes.data.length > 0) setSelectedAccount(accRes.data[0].id);
      }
      if (histRes.data) setHistory(histRes.data);
    });
  }, [user]);

  const runAudit = async () => {
    if (!user || !selectedAccount) return;
    const account = accounts.find(a => a.id === selectedAccount);
    if (!account) return;
    const domain = account.email.split("@")[1];

    setLoading(true);
    setAudit(null);

    try {
      // Gather data for AI analysis
      const [dnsRes, blRes, campaignsRes] = await Promise.all([
        supabase.functions.invoke("check-dns", { body: { domain } }),
        supabase.functions.invoke("check-blacklist", { body: { domain, accountId: selectedAccount } }),
        supabase.from("campaigns").select("sent_count, open_count, reply_count, bounce_count, body, subject").eq("account_id", selectedAccount).order("created_at", { ascending: false }).limit(3),
      ]);

      const totalSent = (campaignsRes.data || []).reduce((s: number, c: any) => s + c.sent_count, 0);
      const totalOpens = (campaignsRes.data || []).reduce((s: number, c: any) => s + c.open_count, 0);
      const totalReplies = (campaignsRes.data || []).reduce((s: number, c: any) => s + c.reply_count, 0);
      const totalBounces = (campaignsRes.data || []).reduce((s: number, c: any) => s + c.bounce_count, 0);

      const { data, error } = await supabase.functions.invoke("generate-email-copy", {
        body: {
          type: "run-full-audit",
          domain,
          dns_data: dnsRes.data || {},
          blacklist_data: blRes.data || {},
          campaigns_data: (campaignsRes.data || []).map((c: any) => ({ subject: c.subject, body: c.body?.substring(0, 200) })),
          engagement_data: {
            total_sent: totalSent,
            open_rate: totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0,
            reply_rate: totalSent > 0 ? Math.round((totalReplies / totalSent) * 100) : 0,
            bounce_rate: totalSent > 0 ? Math.round((totalBounces / totalSent) * 100) : 0,
          },
        },
      });
      if (error) throw error;

      const content = data?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]) as AuditResult;
        setAudit(result);

        // Save to DB
        await supabase.from("audit_reports").insert({
          user_id: user.id,
          domain,
          dns_score: result.dns_score,
          blacklist_score: result.blacklist_score,
          infrastructure_score: result.infrastructure_score,
          content_score: result.content_score,
          engagement_score: result.engagement_score,
          total_score: result.total_score,
          grade: result.grade,
          details: result.layers as any,
          fixes: result.priority_fixes as any,
        });
      }
    } catch (e: any) {
      toast.error(e.message || "Audit failed");
    } finally {
      setLoading(false);
    }
  };

  const ringSize = 140;
  const strokeWidth = 10;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = audit ? circumference - (audit.total_score / 100) * circumference : circumference;
  const scoreColor = (audit?.total_score || 0) >= 80 ? "hsl(var(--success))" : (audit?.total_score || 0) >= 60 ? "hsl(var(--warning))" : "hsl(var(--destructive))";

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Deliverability Audit</h1>
          <p className="text-muted-foreground text-sm mt-1">5-layer AI diagnosis with prioritized fixes</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger className="w-[250px]"><SelectValue placeholder="Select account" /></SelectTrigger>
            <SelectContent>
              {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.email})</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={runAudit} disabled={loading || !selectedAccount} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            Run Audit
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          <Card className="bg-card border-border">
            <CardContent className="pt-6 flex items-center gap-4">
              <Skeleton className="h-[140px] w-[140px] rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </CardContent>
          </Card>
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}

      {audit && !loading && (
        <>
          {/* Score Card */}
          <Card className="bg-card border-border">
            <CardContent className="pt-6 flex flex-col md:flex-row items-center gap-6">
              <div className="relative">
                <svg width={ringSize} height={ringSize} className="transform -rotate-90">
                  <circle cx={ringSize/2} cy={ringSize/2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} />
                  <circle cx={ringSize/2} cy={ringSize/2} r={radius} fill="none" stroke={scoreColor} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold" style={{ color: scoreColor }}>{audit.total_score}</span>
                  <Badge variant="outline" className={`mt-1 text-lg ${gradeColors[audit.grade] || ""}`}>{audit.grade}</Badge>
                </div>
              </div>
              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { label: "DNS", score: audit.dns_score },
                    { label: "Blacklist", score: audit.blacklist_score },
                    { label: "Infra", score: audit.infrastructure_score },
                    { label: "Content", score: audit.content_score },
                    { label: "Engagement", score: audit.engagement_score },
                  ].map((item, i) => (
                    <div key={i} className="text-center p-2 rounded-md bg-secondary/30 border border-border">
                      <div className={`text-lg font-bold ${item.score >= 80 ? "text-emerald-400" : item.score >= 60 ? "text-warning" : "text-destructive"}`}>{item.score}</div>
                      <div className="text-[10px] text-muted-foreground">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Priority Fixes */}
          {audit.priority_fixes && audit.priority_fixes.length > 0 && (
            <Card className="bg-card border-primary/20">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-primary">
                  <AlertTriangle className="h-4 w-4" />
                  Fix These First
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {audit.priority_fixes.map((fix, i) => (
                  <div key={i} className="p-3 rounded-md bg-secondary/30 border border-border">
                    <div className="flex items-start gap-2">
                      <span className="text-primary font-bold text-sm">#{i + 1}</span>
                      <div>
                        <p className="text-sm font-medium">{fix.problem}</p>
                        <p className="text-xs text-muted-foreground mt-1">{fix.steps}</p>
                        <Badge variant="outline" className="mt-2 text-xs bg-primary/10 text-primary border-primary/30">Impact: {fix.estimated_impact}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Layer Details */}
          {audit.layers && audit.layers.map((layer, li) => (
            <Collapsible key={li}>
              <Card className="bg-card border-border">
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={layer.score >= 80 ? "text-emerald-400" : layer.score >= 60 ? "text-warning" : "text-destructive"}>
                        {layerIcons[li] || <Shield className="h-4 w-4" />}
                      </span>
                      <CardTitle className="text-base">{layer.name}</CardTitle>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${layer.score >= 80 ? "text-emerald-400" : layer.score >= 60 ? "text-warning" : "text-destructive"}`}>{layer.score}/100</span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-1">
                    {layer.checks?.map((check, ci) => (
                      <div key={ci} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div className="flex items-center gap-3">
                          {check.passed ? <Check className="h-4 w-4 text-emerald-400 shrink-0" /> : <X className="h-4 w-4 text-destructive shrink-0" />}
                          <div>
                            <p className="text-sm font-medium">{check.name}</p>
                            <p className="text-xs text-muted-foreground">{check.detail}</p>
                          </div>
                        </div>
                        {check.impact && <span className="text-xs text-muted-foreground">{check.impact}</span>}
                      </div>
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </>
      )}

      {/* History */}
      {history.length > 0 && !loading && !audit && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Audit History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((h: any) => (
              <div key={h.id} className="flex items-center justify-between p-3 rounded-md bg-secondary/30 border border-border">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={`text-lg px-2 ${gradeColors[h.grade] || ""}`}>{h.grade}</Badge>
                  <div>
                    <p className="text-sm font-medium">{h.domain}</p>
                    <p className="text-xs text-muted-foreground">Score: {h.total_score}/100</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!audit && !loading && accounts.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="font-medium text-lg mb-1">Connect an account to audit</p>
            <p className="text-muted-foreground text-sm text-center max-w-md">
              Add an email account first, then run a full 5-layer deliverability audit with AI-powered diagnosis and fix recommendations.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

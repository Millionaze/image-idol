import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Loader2, Check, X, ExternalLink, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface AuditCheck {
  name: string;
  passed: boolean;
  detail: string;
  points: number;
  fixUrl?: string;
}

interface AccountAudit {
  id: string;
  name: string;
  email: string;
  checks: AuditCheck[];
  score: number;
  grade: string;
}

function getGrade(score: number) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

const gradeColors: Record<string, string> = {
  A: "text-emerald-400 bg-emerald-500/20 border-emerald-500/30",
  B: "text-blue-400 bg-blue-500/20 border-blue-500/30",
  C: "text-warning bg-warning/20 border-warning/30",
  D: "text-orange-400 bg-orange-500/20 border-orange-500/30",
  F: "text-destructive bg-destructive/20 border-destructive/30",
};

export default function AuditReport() {
  const { user } = useAuth();
  const [audits, setAudits] = useState<AccountAudit[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const runAudit = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: accounts } = await supabase
        .from("email_accounts")
        .select("*")
        .eq("user_id", user.id);

      if (!accounts || accounts.length === 0) {
        toast.error("No accounts connected");
        setLoading(false);
        return;
      }

      const results: AccountAudit[] = [];

      for (const acc of accounts) {
        const checks: AuditCheck[] = [];

        // DNS checks
        try {
          const { data: dnsData } = await supabase.functions.invoke("check-dns", {
            body: { domain: acc.email.split("@")[1] },
          });
          const dns = dnsData || {};
          checks.push({ name: "SPF Record", passed: !!dns.spf, detail: dns.spf ? "SPF configured" : "No SPF record found", points: 20, fixUrl: "/accounts" });
          checks.push({ name: "DKIM Record", passed: !!dns.dkim, detail: dns.dkim ? "DKIM configured" : "No DKIM record found", points: 20, fixUrl: "/accounts" });
          checks.push({ name: "DMARC Record", passed: !!dns.dmarc, detail: dns.dmarc ? "DMARC configured" : "No DMARC record found", points: 20, fixUrl: "/accounts" });
        } catch {
          checks.push({ name: "SPF Record", passed: false, detail: "DNS check failed", points: 20 });
          checks.push({ name: "DKIM Record", passed: false, detail: "DNS check failed", points: 20 });
          checks.push({ name: "DMARC Record", passed: false, detail: "DNS check failed", points: 20 });
        }

        // Blacklist check
        try {
          const { data: blData } = await supabase.functions.invoke("check-blacklist", {
            body: { domain: acc.email.split("@")[1], accountId: acc.id },
          });
          const isClean = blData?.is_clean !== false;
          checks.push({ name: "Not Blacklisted", passed: isClean, detail: isClean ? "Clean" : `Listed on: ${blData?.listed_on?.join(", ") || "unknown"}`, points: 20, fixUrl: "/accounts" });
        } catch {
          checks.push({ name: "Not Blacklisted", passed: false, detail: "Check failed", points: 20 });
        }

        // Reputation
        checks.push({
          name: "Reputation Score > 70",
          passed: acc.reputation_score > 70,
          detail: `Score: ${acc.reputation_score}`,
          points: 10,
          fixUrl: "/warmup",
        });

        // Campaign open rate
        const { data: campaigns } = await supabase
          .from("campaigns")
          .select("sent_count, open_count")
          .eq("account_id", acc.id)
          .order("created_at", { ascending: false })
          .limit(1);

        const lastCampaign = campaigns?.[0];
        const openRate = lastCampaign && lastCampaign.sent_count > 0
          ? Math.round((lastCampaign.open_count / lastCampaign.sent_count) * 100)
          : 0;
        checks.push({
          name: "Open Rate > 20%",
          passed: openRate > 20,
          detail: lastCampaign ? `${openRate}% open rate` : "No campaigns sent",
          points: 10,
          fixUrl: "/campaigns",
        });

        const totalPoints = checks.reduce((s, c) => s + c.points, 0);
        const earnedPoints = checks.filter((c) => c.passed).reduce((s, c) => s + c.points, 0);
        const score = Math.round((earnedPoints / totalPoints) * 100);

        results.push({
          id: acc.id,
          name: acc.name,
          email: acc.email,
          checks,
          score,
          grade: getGrade(score),
        });
      }

      setAudits(results);
    } catch (e: any) {
      toast.error(e.message || "Audit failed");
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = () => {
    const now = new Date().toLocaleDateString();
    const ready = audits.filter((a) => a.grade === "A" || a.grade === "B").length;
    const html = `<!DOCTYPE html><html><head><title>Pixel Growth Audit Report</title><style><style>
      body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#1a1a2e;background:#fff}
      h1{color:#e65100}h2{margin-top:30px;border-bottom:2px solid #e65100;padding-bottom:8px}
      .check{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eee}
      .pass{color:#2e7d32}.fail{color:#c62828}.grade{font-size:36px;font-weight:bold;padding:8px 16px;border-radius:8px;display:inline-block}
      .summary{background:#f5f5f5;padding:16px;border-radius:8px;margin:20px 0}
    </style></head><body>
    <h1>🔥 MailForge Deliverability Audit</h1>
    <p>Generated: ${now}</p>
    <div class="summary"><strong>${ready} of ${audits.length}</strong> accounts are campaign-ready. <strong>${audits.length - ready}</strong> accounts need attention.</div>
    ${audits.map((a) => `
      <h2>${a.name} (${a.email})</h2>
      <p>Grade: <span class="grade" style="background:${a.grade === "A" || a.grade === "B" ? "#e8f5e9" : a.grade === "C" ? "#fff3e0" : "#ffebee"}">${a.grade}</span> — Score: ${a.score}/100</p>
      ${a.checks.map((c) => `<div class="check"><span class="${c.passed ? "pass" : "fail"}">${c.passed ? "✓" : "✗"}</span> <strong>${c.name}</strong>: ${c.detail} (${c.points}pts)</div>`).join("")}
    `).join("")}
    </body></html>`;
    const w = window.open();
    w?.document.write(html);
    w?.document.close();
  };

  const readyCount = audits.filter((a) => a.grade === "A" || a.grade === "B").length;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Deliverability Audit</h1>
          <p className="text-muted-foreground text-sm mt-1">Full audit of all connected accounts</p>
        </div>
        <Button onClick={runAudit} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ClipboardCheck className="h-4 w-4 mr-2" />}
          Run Full Audit
        </Button>
      </div>

      {audits.length > 0 && (
        <>
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <p className="text-sm">
                <span className="font-bold text-emerald-400">{readyCount} of {audits.length}</span> accounts are campaign-ready.{" "}
                {audits.length - readyCount > 0 && (
                  <span className="text-warning font-bold">{audits.length - readyCount} accounts need attention.</span>
                )}
              </p>
            </CardContent>
          </Card>

          {audits.map((audit) => (
            <Card key={audit.id} className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">{audit.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{audit.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">{audit.score}/100</span>
                  <Badge variant="outline" className={`text-lg px-3 py-1 ${gradeColors[audit.grade]}`}>
                    {audit.grade}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                {audit.checks.map((c, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      {c.passed ? <Check className="h-4 w-4 text-emerald-400" /> : <X className="h-4 w-4 text-destructive" />}
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.detail}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{c.points}pts</span>
                      {!c.passed && c.fixUrl && (
                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate(c.fixUrl!)}>
                          Fix <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          <Button onClick={downloadReport} variant="outline">
            <FileDown className="h-4 w-4 mr-2" />
            Download Report
          </Button>
        </>
      )}
    </div>
  );
}

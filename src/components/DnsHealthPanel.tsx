import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronUp, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface DnsResult {
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  spf_record: string | null;
  dkim_record: string | null;
  dmarc_record: string | null;
  dkim_selector: string | null;
  score: number;
}

interface DnsHealthPanelProps {
  domain: string;
  onResult?: (result: DnsResult) => void;
  className?: string;
}

export function DnsHealthPanel({ domain, onResult, className }: DnsHealthPanelProps) {
  const [result, setResult] = useState<DnsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const check = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-dns", { body: { domain } });
      if (error) throw error;
      setResult(data);
      onResult?.(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const scoreBadge = result ? (
    result.score === 3 ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-xs font-medium text-success">
        <Shield className="h-3 w-3" />3/3 Healthy
      </span>
    ) : result.score === 2 ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
        <Shield className="h-3 w-3" />2/3 Needs attention
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-medium text-destructive">
        <Shield className="h-3 w-3" />{result.score}/3 Critical
      </span>
    )
  ) : null;

  const rows = result ? [
    {
      key: "spf",
      label: "SPF",
      ok: result.spf,
      record: result.spf_record,
      fix: `Add a TXT record to your DNS:\nHost: @\nValue: "v=spf1 include:_spf.google.com ~all"`,
    },
    {
      key: "dkim",
      label: "DKIM",
      ok: result.dkim,
      record: result.dkim_record ? `Selector: ${result.dkim_selector}` : null,
      fix: "DKIM is set up in your email provider's admin dashboard.\n• Google Workspace: Admin → Apps → Gmail → Authenticate email\n• Microsoft 365: Defender → Email authentication → DKIM",
    },
    {
      key: "dmarc",
      label: "DMARC",
      ok: result.dmarc,
      record: result.dmarc_record,
      fix: `Add a TXT record to your DNS:\nHost: _dmarc\nValue: "v=DMARC1; p=none; rua=mailto:dmarc@${domain}"`,
    },
  ] : [];

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Domain Health — {domain}</p>
        <div className="flex items-center gap-2">
          {scoreBadge}
          <Button variant="outline" size="sm" onClick={check} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            {result ? "Recheck" : "Check"}
          </Button>
        </div>
      </div>

      {result && (
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={r.key} className="rounded-md bg-secondary p-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {r.ok ? (
                    <CheckCircle className="h-4 w-4 text-success" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm font-medium">{r.label}</span>
                  {r.ok && r.record && (
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">{r.record}</span>
                  )}
                </div>
                {!r.ok && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpanded(expanded === r.key ? null : r.key)}
                    className="h-6 px-2"
                  >
                    {expanded === r.key ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    <span className="text-xs ml-1">How to fix</span>
                  </Button>
                )}
              </div>
              {expanded === r.key && !r.ok && (
                <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap bg-background rounded p-2">
                  {r.fix}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

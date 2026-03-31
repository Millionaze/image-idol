import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, XCircle, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Alert {
  id: string;
  type: "warning" | "success" | "error";
  message: string;
  timestamp: string;
  cta: { label: string; route: string } | null;
}

interface WarmupAlertsPanelProps {
  accounts: any[];
  warmupLogs: any[];
}

export function WarmupAlertsPanel({ accounts, warmupLogs }: WarmupAlertsPanelProps) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const alerts: Alert[] = [];

  accounts.forEach((a) => {
    const accountLogs = warmupLogs.filter((l) => l.account_id === a.id);
    const totalSent = accountLogs.filter((l) => l.type === "sent").length;
    const spamRescued = accountLogs.filter((l) => l.type === "rescued_from_spam").length;
    const spamRate = totalSent > 0 ? (spamRescued / totalSent) * 100 : 0;

    if (spamRate > 3 && a.warmup_enabled) {
      alerts.push({
        id: `spam-${a.id}`,
        type: "warning",
        message: `${a.email} spam rate exceeded ${spamRate.toFixed(1)}% — consider pausing warmup`,
        timestamp: new Date().toISOString(),
        cta: { label: "Fix Now", route: "/accounts" },
      });
    }

    if (a.reputation_score >= 70 && a.warmup_ramp_day >= 21) {
      alerts.push({
        id: `ready-${a.id}`,
        type: "success",
        message: `${a.email} is ready for campaigns!`,
        timestamp: new Date().toISOString(),
        cta: { label: "Start Campaign", route: "/campaigns" },
      });
    }

    if (!a.warmup_enabled && a.reputation_score < 30) {
      alerts.push({
        id: `low-${a.id}`,
        type: "error",
        message: `${a.email} has low reputation (${a.reputation_score}) — enable warmup to recover`,
        timestamp: new Date().toISOString(),
        cta: null,
      });
    }
  });

  const visibleAlerts = alerts.filter((a) => !dismissed.has(a.id));

  if (visibleAlerts.length === 0) return null;

  const icons = {
    warning: <AlertTriangle className="h-4 w-4 text-warning shrink-0" />,
    success: <CheckCircle2 className="h-4 w-4 text-success shrink-0" />,
    error: <XCircle className="h-4 w-4 text-destructive shrink-0" />,
  };

  const borderColors = {
    warning: "border-warning/30",
    success: "border-success/30",
    error: "border-destructive/30",
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Smart Alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {visibleAlerts.map((alert) => (
          <div key={alert.id} className={`flex items-start gap-3 rounded-lg border ${borderColors[alert.type]} bg-secondary/50 p-3 text-sm`}>
            {icons[alert.type]}
            <div className="flex-1">
              <p className="text-foreground">{alert.message}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{new Date(alert.timestamp).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {alert.cta && (
                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => navigate(alert.cta!.route)}>
                  {alert.cta.label}
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDismissed((s) => new Set(s).add(alert.id))}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

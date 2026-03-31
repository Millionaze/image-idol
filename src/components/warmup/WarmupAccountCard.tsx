import { Mail, Pause, Play, Rocket, Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { DeliverabilityRing } from "@/components/DeliverabilityRing";
import { addDays, format } from "date-fns";

interface WarmupAccountCardProps {
  account: any;
  warmupLogs: any[];
  onToggleWarmup: (id: string, enabled: boolean) => void;
  onBoost: (id: string) => void;
  onOpenSettings: (account: any) => void;
  onOpenReadiness: (account: any) => void;
}

function getProviderIcon(smtpHost: string) {
  if (smtpHost?.includes("gmail") || smtpHost?.includes("google")) return "✉️";
  if (smtpHost?.includes("outlook") || smtpHost?.includes("office365")) return "📧";
  return "📬";
}

function getStatusChip(account: any) {
  if (!account.warmup_enabled) return { label: "Paused", className: "bg-muted text-muted-foreground" };
  if (account.reputation_score >= 70) return { label: "Healthy", className: "bg-success/20 text-success border-success/30" };
  if (account.reputation_score >= 40) return { label: "At Risk", className: "bg-warning/20 text-warning border-warning/30" };
  return { label: "Low Rep", className: "bg-destructive/20 text-destructive border-destructive/30" };
}

function getReadinessBadge(account: any) {
  if (!account.warmup_enabled && account.reputation_score < 30) return { label: "Not Ready", className: "bg-destructive/15 text-destructive" };
  if (account.warmup_enabled && account.warmup_ramp_day < 21) return { label: "Warming Up", className: "bg-warning/15 text-warning" };
  if (account.reputation_score >= 70 && account.warmup_ramp_day >= 30) return { label: "Maintenance Mode", className: "bg-blue-500/15 text-blue-400" };
  if (account.reputation_score >= 70 && account.warmup_ramp_day >= 21) return { label: "Ready for Campaigns", className: "bg-success/15 text-success" };
  return { label: "Warming Up", className: "bg-warning/15 text-warning" };
}

export function WarmupAccountCard({ account, warmupLogs, onToggleWarmup, onBoost, onOpenSettings, onOpenReadiness }: WarmupAccountCardProps) {
  const rampDay = account.warmup_ramp_day || 0;
  const rampProgress = Math.min(100, (rampDay / 30) * 100);
  const dailyTarget = account.warmup_enabled ? Math.min(rampDay * 2, account.warmup_daily_limit) : 0;
  const estimatedCompletion = account.warmup_start_date ? format(addDays(new Date(account.warmup_start_date), 30), "MMM d, yyyy") : "—";

  const accountLogs = warmupLogs.filter((l) => l.account_id === account.id);
  const totalSent = accountLogs.filter((l) => l.type === "sent").length;
  const spamRescued = accountLogs.filter((l) => l.type === "rescued_from_spam").length;
  const inboxRate = totalSent > 0 ? Math.round(((totalSent - spamRescued) / totalSent) * 100) : 100;

  const status = getStatusChip(account);
  const readiness = getReadinessBadge(account);

  return (
    <Card
      className="border-border/50 hover:border-primary/30 transition-colors cursor-pointer"
      onClick={() => onOpenReadiness(account)}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{getProviderIcon(account.smtp_host)}</span>
            <div>
              <p className="font-medium text-sm">{account.email}</p>
              <p className="text-xs text-muted-foreground">{account.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className={`text-[10px] ${status.className}`}>{status.label}</Badge>
            <Badge variant="outline" className={`text-[10px] ${readiness.className}`}>{readiness.label}</Badge>
          </div>
        </div>

        {/* Reputation ring + stats */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <DeliverabilityRing score={account.reputation_score} size={64} />
          </div>
          <div className="flex-1 space-y-1.5">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Day {rampDay} of 30</span>
                <span className="text-muted-foreground">{Math.round(rampProgress)}%</span>
              </div>
              <Progress value={rampProgress} className="h-1.5 [&>div]:bg-primary" />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Volume: <span className="text-foreground">{dailyTarget}/day → {account.warmup_daily_limit}/day</span></span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Inbox: <span className="text-foreground">{inboxRate}%</span></span>
              <span className="text-muted-foreground">Est. complete: <span className="text-foreground">{estimatedCompletion}</span></span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs gap-1"
            onClick={() => onToggleWarmup(account.id, !account.warmup_enabled)}
          >
            {account.warmup_enabled ? <><Pause className="h-3 w-3" />Pause</> : <><Play className="h-3 w-3" />Resume</>}
          </Button>
          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1" onClick={() => onBoost(account.id)}>
            <Rocket className="h-3 w-3" />Boost
          </Button>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => onOpenSettings(account)}>
            <Settings className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

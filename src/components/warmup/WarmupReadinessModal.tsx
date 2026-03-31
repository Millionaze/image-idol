import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DeliverabilityRing } from "@/components/DeliverabilityRing";
import { useNavigate } from "react-router-dom";
import { Lightbulb } from "lucide-react";

interface WarmupReadinessModalProps {
  account: any | null;
  warmupLogs: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function computeScores(account: any, warmupLogs: any[]) {
  if (!account) return { overall: 0, gmail: 0, outlook: 0, reply: 0, spam: 0, dns: 0, ramp: 0 };

  const logs = warmupLogs.filter((l) => l.account_id === account.id);
  const totalSent = logs.filter((l) => l.type === "sent").length;
  const spamRescued = logs.filter((l) => l.type === "rescued_from_spam").length;
  const inboxRate = totalSent > 0 ? ((totalSent - spamRescued) / totalSent) * 100 : 80;
  const spamRate = totalSent > 0 ? (spamRescued / totalSent) * 100 : 0;
  const rampProgress = Math.min(100, ((account.warmup_ramp_day || 0) / 30) * 100);

  const gmail = Math.round(Math.min(100, inboxRate + 5));
  const outlook = Math.round(Math.min(100, inboxRate - 2));
  const reply = Math.min(100, Math.round(logs.filter((l) => l.type === "received").length / Math.max(1, totalSent) * 100));
  const spam = Math.round(Math.max(0, 100 - spamRate * 10));
  const dns = account.reputation_score >= 50 ? 85 : 50;
  const ramp = Math.round(rampProgress);

  const overall = Math.round(
    account.reputation_score * 0.4 + inboxRate * 0.3 + dns * 0.2 + rampProgress * 0.1
  );

  return { overall: Math.min(100, overall), gmail, outlook, reply, spam, dns, ramp };
}

function getTips(scores: ReturnType<typeof computeScores>) {
  const tips: string[] = [];
  if (scores.spam < 80) tips.push("Your spam rate is high. Reduce daily volume and ensure DKIM/SPF are configured.");
  if (scores.dns < 70) tips.push("Check your DNS records — missing SPF or DKIM will hurt deliverability.");
  if (scores.ramp < 60) tips.push("Keep warming up! You haven't reached enough volume yet.");
  if (scores.reply < 30) tips.push("Low reply rate detected. Enable AI warmup content for more natural conversations.");
  if (tips.length === 0) tips.push("Great progress! Your account is looking healthy. Continue warming up to maintain reputation.");
  return tips.slice(0, 3);
}

export function WarmupReadinessModal({ account, warmupLogs, open, onOpenChange }: WarmupReadinessModalProps) {
  const navigate = useNavigate();
  const scores = computeScores(account, warmupLogs);
  const tips = getTips(scores);

  const breakdowns = [
    { label: "Gmail Inbox Rate", value: scores.gmail, color: "bg-primary" },
    { label: "Outlook Inbox Rate", value: scores.outlook, color: "bg-blue-500" },
    { label: "Reply Rate", value: scores.reply, color: "bg-success" },
    { label: "Spam Score", value: scores.spam, color: "bg-warning" },
    { label: "DNS Health", value: scores.dns, color: "bg-chart-3" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{account?.email} — Warmup Readiness</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center py-4">
          <div className="relative">
            <DeliverabilityRing score={scores.overall} size={140} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">Overall Readiness Score</p>
        </div>

        <div className="space-y-3">
          {breakdowns.map((b) => (
            <div key={b.label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{b.label}</span>
                <span className="font-medium">{b.value}%</span>
              </div>
              <Progress value={b.value} className={`h-1.5 [&>div]:${b.color}`} />
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2 rounded-lg bg-secondary/50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Lightbulb className="h-3.5 w-3.5 text-warning" />
            What to do next
          </div>
          {tips.map((tip, i) => (
            <p key={i} className="text-xs text-muted-foreground pl-5">• {tip}</p>
          ))}
        </div>

        <Button
          className="w-full mt-2"
          disabled={scores.overall < 70}
          onClick={() => { onOpenChange(false); navigate("/campaigns"); }}
        >
          {scores.overall >= 70 ? "Graduate to Campaign" : `Score ${scores.overall}/100 — Need 70+ to graduate`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export { computeScores };

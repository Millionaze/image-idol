import { cn } from "@/lib/utils";

interface ReputationBarProps {
  score: number;
  className?: string;
}

export function ReputationBar({ score, className }: ReputationBarProps) {
  const color =
    score >= 70
      ? "bg-success"
      : score >= 40
        ? "bg-warning"
        : "bg-destructive";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-2 w-20 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{score}</span>
    </div>
  );
}

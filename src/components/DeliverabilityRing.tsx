import { cn } from "@/lib/utils";

interface DeliverabilityRingProps {
  score: number;
  size?: number;
  className?: string;
}

export function DeliverabilityRing({ score, size = 80, className }: DeliverabilityRingProps) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 71 ? "hsl(var(--success))" :
    score >= 41 ? "hsl(var(--warning))" :
    "hsl(var(--destructive))";

  const label =
    score >= 71 ? "Good" :
    score >= 41 ? "Fair" :
    "Poor";

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-lg font-bold" style={{ color }}>{score}</span>
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

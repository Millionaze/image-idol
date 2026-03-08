import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sending: "bg-blue-500/20 text-blue-400",
  active: "bg-success/20 text-success",
  paused: "bg-primary/20 text-primary",
  pending: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/20 text-blue-400",
  opened: "bg-success/20 text-success",
  bounced: "bg-destructive/20 text-destructive",
  success: "bg-success/20 text-success",
  failed: "bg-destructive/20 text-destructive",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("border-0 text-xs font-medium capitalize", statusStyles[status] || "bg-muted text-muted-foreground")}>
      {status}
    </Badge>
  );
}

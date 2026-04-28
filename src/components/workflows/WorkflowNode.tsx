import { Handle, Position, type NodeProps } from "@xyflow/react";
import { iconForAction, labelForAction, type NodeData } from "./lib/catalog";
import { Zap, Timer, GitBranch, GitMerge, Target, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const KIND_STYLES: Record<string, string> = {
  trigger: "bg-[hsl(var(--chart-4)/0.15)] border-[hsl(var(--chart-4))] text-foreground",
  action: "bg-primary/10 border-primary/60 text-foreground",
  wait: "bg-muted border-border text-foreground",
  condition: "bg-[hsl(var(--chart-3)/0.15)] border-[hsl(var(--chart-3))] text-foreground",
  split: "bg-warning/15 border-warning text-foreground",
  goal: "bg-success/15 border-success text-foreground border-dashed",
  exit: "bg-muted border-border text-muted-foreground",
};

export function WorkflowNode({ data, selected }: NodeProps) {
  const d = data as unknown as NodeData;
  const Icon =
    d.kind === "trigger" ? Zap :
    d.kind === "wait" ? Timer :
    d.kind === "condition" ? GitBranch :
    d.kind === "split" ? GitMerge :
    d.kind === "goal" ? Target :
    d.kind === "exit" ? LogOut :
    iconForAction(d.action_type);

  const label =
    d.kind === "action" ? labelForAction(d.action_type) :
    d.kind === "trigger" ? `Trigger: ${d.config?.trigger_type ?? "—"}` :
    d.kind === "wait" ? "Wait" :
    d.kind === "condition" ? "Condition" :
    d.kind === "split" ? "A/B Split" :
    d.kind === "goal" ? "Goal" :
    "Exit";

  const subtitle = d.label || subtitleFor(d);

  const isCondition = d.kind === "condition";
  const isSplit = d.kind === "split";
  const variantCount = isSplit ? Math.max(2, (d.config?.variants?.length ?? 2)) : 0;

  return (
    <div
      className={cn(
        "rounded-md border-2 px-3 py-2 min-w-[200px] shadow-md transition-all",
        KIND_STYLES[d.kind] || "bg-card border-border",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      {d.kind !== "trigger" && <Handle type="target" position={Position.Top} className="!bg-foreground" />}
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <div className="font-medium text-sm">{label}</div>
      </div>
      {subtitle && <div className="text-xs text-muted-foreground mt-1 truncate max-w-[180px]">{subtitle}</div>}

      {isCondition ? (
        <>
          <Handle type="source" position={Position.Bottom} id="true" style={{ left: "30%" }} className="!bg-success" />
          <Handle type="source" position={Position.Bottom} id="false" style={{ left: "70%" }} className="!bg-destructive" />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-2 px-1">
            <span>true</span>
            <span>false</span>
          </div>
        </>
      ) : isSplit ? (
        <>
          {Array.from({ length: variantCount }).map((_, i) => (
            <Handle
              key={i}
              type="source"
              position={Position.Bottom}
              id={`v${i}`}
              style={{ left: `${((i + 1) * 100) / (variantCount + 1)}%` }}
              className="!bg-warning"
            />
          ))}
        </>
      ) : d.kind !== "exit" ? (
        <Handle type="source" position={Position.Bottom} className="!bg-foreground" />
      ) : null}
    </div>
  );
}

function subtitleFor(d: NodeData): string {
  if (d.kind === "wait") {
    const c = d.config || {};
    if (c.mode === "event") return `Until ${c.event_type ?? "event"}`;
    return `${c.days ?? 0}d ${c.hours ?? 0}h ${c.minutes ?? 0}m`;
  }
  if (d.kind === "action" && d.action_type === "send_email") {
    return d.config?.subject ?? "—";
  }
  if (d.kind === "action" && (d.action_type === "add_tag" || d.action_type === "remove_tag")) {
    const ids: string[] = d.config?.tag_ids ?? [];
    return `${ids.length} tag(s)`;
  }
  if (d.kind === "split") {
    const variants: any[] = d.config?.variants ?? [];
    return variants.map((v) => `${v.weight}%`).join(" / ");
  }
  return "";
}

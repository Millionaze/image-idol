import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export const PRESET_COLORS = [
  { name: "gray", className: "bg-muted" },
  { name: "red", className: "bg-destructive" },
  { name: "orange", className: "bg-primary" },
  { name: "yellow", className: "bg-warning" },
  { name: "green", className: "bg-success" },
  { name: "blue", className: "bg-[hsl(var(--chart-3))]" },
  { name: "purple", className: "bg-[hsl(var(--chart-4))]" },
];

export function colorClass(name?: string | null): string {
  return PRESET_COLORS.find((c) => c.name === name)?.className ?? "bg-muted";
}

interface ColorPickerProps {
  value?: string | null;
  onChange: (color: string) => void;
  className?: string;
}

export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-7 w-7 rounded-full border border-border shrink-0",
            colorClass(value),
            className,
          )}
          aria-label="Pick color"
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="grid grid-cols-7 gap-1">
          {PRESET_COLORS.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => onChange(c.name)}
              className={cn(
                "h-7 w-7 rounded-full border border-border flex items-center justify-center hover:scale-110 transition-transform",
                c.className,
              )}
              aria-label={c.name}
            >
              {value === c.name && <Check className="h-3.5 w-3.5 text-white" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

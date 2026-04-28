import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ACTION_CATALOG } from "./lib/catalog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (item: { type: string; label: string; kind: string }) => void;
}

export function ActionPickerDialog({ open, onOpenChange, onPick }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a step</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {ACTION_CATALOG.map((cat) => (
            <div key={cat.category}>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{cat.category}</div>
              <div className="grid grid-cols-2 gap-2">
                {cat.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => {
                        onPick(item);
                        onOpenChange(false);
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-md border border-border hover:border-primary hover:bg-accent transition-colors text-sm text-left"
                    >
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

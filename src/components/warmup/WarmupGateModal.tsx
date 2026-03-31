import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface WarmupGateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  score: number;
  accountEmail: string;
  onProceed: () => void;
}

export function WarmupGateModal({ open, onOpenChange, score, accountEmail, onProceed }: WarmupGateModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <DialogTitle className="text-base">Account Not Fully Warmed</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            <strong>{accountEmail}</strong> is only <strong>{score}%</strong> warmed up. Sending campaigns now may hurt your sender reputation and deliverability.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Wait and continue warming up
          </Button>
          <Button variant="ghost" className="text-destructive text-xs" onClick={() => { onOpenChange(false); onProceed(); }}>
            Proceed anyway (not recommended)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

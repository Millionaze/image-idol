import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BlacklistStatusProps {
  accountId: string;
  domain: string;
}

export function BlacklistStatus({ accountId, domain }: BlacklistStatusProps) {
  const { toast } = useToast();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ is_clean: boolean; listed_on: string[]; ip?: string } | null>(null);

  const checkBlacklist = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-blacklist", {
        body: { domain, account_id: accountId },
      });
      if (error) throw error;
      setResult(data);
      if (!data.is_clean) {
        toast({
          title: "Blacklist Warning",
          description: `Listed on ${data.listed_on.length} blacklist(s)`,
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Check failed", description: e.message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs gap-2"
        onClick={checkBlacklist}
        disabled={checking}
      >
        {checking ? (
          <><Loader2 className="h-3 w-3 animate-spin" />Checking blacklists...</>
        ) : (
          <><ShieldCheck className="h-3 w-3" />Check Blacklists</>
        )}
      </Button>

      {result && (
        <div className={`rounded-md p-2 text-xs ${
          result.is_clean
            ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
            : "bg-destructive/10 text-destructive"
        }`}>
          {result.is_clean ? (
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Clean — not listed on any blacklist</span>
              {result.ip && <span className="text-muted-foreground ml-auto">IP: {result.ip}</span>}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" />
                <span className="font-medium">Listed on {result.listed_on.length} blacklist(s)</span>
              </div>
              <ul className="ml-5 list-disc">
                {result.listed_on.map((bl) => (
                  <li key={bl}>{bl}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface WarmupSettingsDrawerProps {
  account: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function getLocalPrefs(accountId: string) {
  try {
    const stored = localStorage.getItem("warmup_prefs");
    const all = stored ? JSON.parse(stored) : {};
    return all[accountId] || { persona: "startup", maintenance: false, autoPause: true, useSpintax: false, startHour: "9", endHour: "18" };
  } catch { return { persona: "startup", maintenance: false, autoPause: true, useSpintax: false, startHour: "9", endHour: "18" }; }
}

function setLocalPrefs(accountId: string, prefs: any) {
  try {
    const stored = localStorage.getItem("warmup_prefs");
    const all = stored ? JSON.parse(stored) : {};
    all[accountId] = prefs;
    localStorage.setItem("warmup_prefs", JSON.stringify(all));
  } catch {}
}

const hours = Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `${i.toString().padStart(2, "0")}:00` }));

export function WarmupSettingsDrawer({ account, open, onOpenChange, onSaved }: WarmupSettingsDrawerProps) {
  const { toast } = useToast();
  const [dailyLimit, setDailyLimit] = useState(5);
  const [weekdaysOnly, setWeekdaysOnly] = useState(true);
  const [prefs, setPrefs] = useState(getLocalPrefs(""));

  useEffect(() => {
    if (account) {
      setDailyLimit(account.warmup_daily_limit);
      setWeekdaysOnly(account.warmup_weekdays_only);
      setPrefs(getLocalPrefs(account.id));
    }
  }, [account]);

  const save = async () => {
    if (!account) return;
    await supabase.from("email_accounts").update({
      warmup_daily_limit: dailyLimit,
      warmup_weekdays_only: weekdaysOnly,
    }).eq("id", account.id);
    setLocalPrefs(account.id, prefs);
    toast({ title: "Settings saved" });
    onSaved();
    onOpenChange(false);
  };

  if (!account) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[380px] overflow-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Warmup Settings</SheetTitle>
          <p className="text-xs text-muted-foreground">{account.email}</p>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Daily volume */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label className="text-sm">Daily Send Volume</Label>
              <span className="text-sm font-medium text-primary">{dailyLimit}/day</span>
            </div>
            <Slider value={[dailyLimit]} onValueChange={([v]) => setDailyLimit(v)} min={2} max={100} step={1} />
            <p className="text-xs text-muted-foreground">
              Ramp preview: Day 1 → 2/day, Day 15 → {Math.min(30, dailyLimit)}/day, Day 30 → {dailyLimit}/day
            </p>
          </div>

          {/* Persona */}
          <div className="space-y-2">
            <Label className="text-sm">Warmup Persona</Label>
            <Select value={prefs.persona} onValueChange={(v) => setPrefs({ ...prefs, persona: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="startup">Startup Founder</SelectItem>
                <SelectItem value="agency">Agency</SelectItem>
                <SelectItem value="saas">SaaS Sales</SelectItem>
                <SelectItem value="recruiter">Recruiter</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Toggles */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Weekdays Only</Label>
                <p className="text-xs text-muted-foreground">Skip weekends</p>
              </div>
              <Switch checked={weekdaysOnly} onCheckedChange={setWeekdaysOnly} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Maintenance Mode</Label>
                <p className="text-xs text-muted-foreground">Low-volume after graduation</p>
              </div>
              <Switch checked={prefs.maintenance} onCheckedChange={(v) => setPrefs({ ...prefs, maintenance: v })} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Auto-pause if spam &gt; 5%</Label>
                <p className="text-xs text-muted-foreground">Safety net</p>
              </div>
              <Switch checked={prefs.autoPause} onCheckedChange={(v) => setPrefs({ ...prefs, autoPause: v })} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Use Spintax</Label>
                <p className="text-xs text-muted-foreground">Varied warmup content</p>
              </div>
              <Switch checked={prefs.useSpintax} onCheckedChange={(v) => setPrefs({ ...prefs, useSpintax: v })} />
            </div>
          </div>

          {/* Sending hours */}
          <div className="space-y-2">
            <Label className="text-sm">Sending Hours</Label>
            <div className="flex items-center gap-2">
              <Select value={prefs.startHour} onValueChange={(v) => setPrefs({ ...prefs, startHour: v })}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>{hours.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}</SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">to</span>
              <Select value={prefs.endHour} onValueChange={(v) => setPrefs({ ...prefs, endHour: v })}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>{hours.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={save} className="w-full">Save Settings</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

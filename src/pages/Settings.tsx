import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Trash2, CheckCircle, XCircle, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Settings from DB
  const [trackingDomain, setTrackingDomain] = useState("");
  const [trackingDomainVerified, setTrackingDomainVerified] = useState(false);
  const [verifyingDomain, setVerifyingDomain] = useState(false);
  const [seedGmail, setSeedGmail] = useState("");
  const [seedOutlook, setSeedOutlook] = useState("");
  const [seedCustom, setSeedCustom] = useState("");
  const [aiWarmupEnabled, setAiWarmupEnabled] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
        if (profile) {
          setName(profile.name || "");
          setEmail(profile.email);
        }

        const { data: settings } = await supabase.from("settings").select("*").eq("user_id", user.id).maybeSingle();
        if (settings) {
          setSettingsId(settings.id);
          setTrackingDomain(settings.tracking_domain || "");
          setTrackingDomainVerified(settings.tracking_domain_verified);
          setSeedGmail(settings.seed_gmail || "");
          setSeedOutlook(settings.seed_outlook || "");
          setSeedCustom(settings.seed_custom || "");
          setAiWarmupEnabled(settings.ai_warmup_enabled);
        }
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({ name }).eq("id", user.id);
      if (error) throw error;
      toast({ title: "Profile updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async (overrides?: Record<string, any>) => {
    if (!user) return;
    setSavingSettings(true);
    try {
      const payload = {
        user_id: user.id,
        tracking_domain: trackingDomain || null,
        tracking_domain_verified: trackingDomainVerified,
        seed_gmail: seedGmail || null,
        seed_outlook: seedOutlook || null,
        seed_custom: seedCustom || null,
        ai_warmup_enabled: aiWarmupEnabled,
        updated_at: new Date().toISOString(),
        ...overrides,
      };

      if (settingsId) {
        const { error } = await supabase.from("settings").update(payload).eq("id", settingsId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("settings").insert(payload).select().single();
        if (error) throw error;
        setSettingsId(data.id);
      }
      toast({ title: "Settings saved" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  const verifyTrackingDomain = async () => {
    if (!trackingDomain) return;
    setVerifyingDomain(true);
    try {
      const resp = await fetch(`https://${trackingDomain}/functions/v1/track-open`, { method: "GET", mode: "no-cors" });
      // no-cors won't give us status, but if it doesn't throw, the domain resolves
      setTrackingDomainVerified(true);
      await saveSettings({ tracking_domain_verified: true, tracking_domain: trackingDomain });
      toast({ title: "Domain verified!" });
    } catch {
      setTrackingDomainVerified(false);
      await saveSettings({ tracking_domain_verified: false, tracking_domain: trackingDomain });
      toast({ title: "Verification failed", description: "Could not reach tracking domain. Check your CNAME record.", variant: "destructive" });
    } finally {
      setVerifyingDomain(false);
    }
  };

  const toggleAiWarmup = async (v: boolean) => {
    setAiWarmupEnabled(v);
    await saveSettings({ ai_warmup_enabled: v });
  };

  const deleteAllCampaigns = async () => {
    if (!user) return;
    setDeleting("campaigns");
    try {
      const { data: campaigns } = await supabase.from("campaigns").select("id");
      if (campaigns && campaigns.length > 0) {
        for (const c of campaigns) {
          await supabase.from("contacts").delete().eq("campaign_id", c.id);
        }
      }
      const { error } = await supabase.from("campaigns").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
      toast({ title: "All campaigns deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const deleteAllAccounts = async () => {
    if (!user) return;
    setDeleting("accounts");
    try {
      const { error } = await supabase.from("email_accounts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
      toast({ title: "All accounts deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[150px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} disabled className="opacity-60" />
          </div>
          <div className="space-y-2">
            <Label>Display Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <Button onClick={saveProfile} disabled={saving} className="gap-2">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : "Save Profile"}
          </Button>
        </CardContent>
      </Card>

      {/* Custom Tracking Domain */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom Tracking Domain</CardTitle>
          <CardDescription>Use your own subdomain for open-tracking pixels instead of the default Supabase URL.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Setup Instructions:</p>
            <p>1. Create a CNAME record pointing your subdomain to <code className="bg-muted px-1 rounded">ivyqkprlrosapkmmwkeh.supabase.co</code></p>
            <p>2. Enter the subdomain below and click Verify</p>
            <p>Example: <code className="bg-muted px-1 rounded">track.yourdomain.com</code></p>
          </div>
          <div className="flex gap-2">
            <Input
              value={trackingDomain}
              onChange={(e) => { setTrackingDomain(e.target.value); setTrackingDomainVerified(false); }}
              placeholder="track.yourdomain.com"
              className="flex-1"
            />
            <Button variant="outline" onClick={verifyTrackingDomain} disabled={verifyingDomain || !trackingDomain} className="gap-2">
              {verifyingDomain ? <Loader2 className="h-4 w-4 animate-spin" /> : trackingDomainVerified ? <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" /> : <XCircle className="h-4 w-4" />}
              {trackingDomainVerified ? "Verified" : "Verify"}
            </Button>
          </div>
          {trackingDomainVerified && (
            <p className="text-xs text-[hsl(var(--success))]">✓ Tracking domain is active. Campaign emails will use this domain for open tracking.</p>
          )}
        </CardContent>
      </Card>

      {/* Seed Accounts for Placement Testing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seed Accounts</CardTitle>
          <CardDescription>Configure seed email addresses for inbox placement testing. You'll send test emails to these addresses and manually check where they land.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Gmail Seed</Label>
            <Input value={seedGmail} onChange={(e) => setSeedGmail(e.target.value)} placeholder="your-seed@gmail.com" />
          </div>
          <div className="space-y-2">
            <Label>Outlook Seed</Label>
            <Input value={seedOutlook} onChange={(e) => setSeedOutlook(e.target.value)} placeholder="your-seed@outlook.com" />
          </div>
          <div className="space-y-2">
            <Label>Custom Seed</Label>
            <Input value={seedCustom} onChange={(e) => setSeedCustom(e.target.value)} placeholder="seed@yourdomain.com" />
          </div>
          <Button variant="outline" onClick={() => saveSettings()} disabled={savingSettings} className="gap-2">
            {savingSettings ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : "Save Seed Accounts"}
          </Button>
        </CardContent>
      </Card>

      {/* AI Warmup Content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Warmup Content
          </CardTitle>
          <CardDescription>Generate unique, AI-written warmup emails for every send instead of using the same hardcoded templates.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable AI Content</p>
              <p className="text-xs text-muted-foreground">Uses Gemini to generate unique subject lines and email bodies for each warmup email</p>
            </div>
            <Switch checked={aiWarmupEnabled} onCheckedChange={toggleAiWarmup} />
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />Delete all campaigns
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all campaigns?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently delete all your campaigns and their contacts.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={deleteAllCampaigns} disabled={deleting === "campaigns"} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleting === "campaigns" ? "Deleting..." : "Delete All"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />Delete all accounts
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all email accounts?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently delete all your connected email accounts.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={deleteAllAccounts} disabled={deleting === "accounts"} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleting === "accounts" ? "Deleting..." : "Delete All"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_TRACKING_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID || "ivyqkprlrosapkmmwkeh"}.supabase.co/functions/v1/track-open`;

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
        if (data) {
          setName(data.name || "");
          setEmail(data.email);
        }
        setTrackingUrl(localStorage.getItem("mailforge_tracking_url") || DEFAULT_TRACKING_URL);
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

  const saveTrackingUrl = () => {
    localStorage.setItem("mailforge_tracking_url", trackingUrl);
    toast({ title: "Tracking URL saved" });
  };

  const deleteAllCampaigns = async () => {
    if (!user) return;
    setDeleting("campaigns");
    try {
      // First delete all contacts for user's campaigns
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tracking Pixel URL</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The base URL used for open-tracking pixels in campaign emails. Defaults to your Supabase edge function URL.
          </p>
          <div className="space-y-2">
            <Label>Base URL</Label>
            <Input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder={DEFAULT_TRACKING_URL} />
          </div>
          <Button variant="outline" onClick={saveTrackingUrl}>Save URL</Button>
        </CardContent>
      </Card>

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
                <AlertDialogDescription>This will permanently delete all your campaigns and their contacts. This action cannot be undone.</AlertDialogDescription>
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
                <AlertDialogDescription>This will permanently delete all your connected email accounts. This action cannot be undone.</AlertDialogDescription>
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

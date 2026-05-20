import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Copy, Trash2, Plus, Loader2, KeyRound } from "lucide-react";
import { Link } from "react-router-dom";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  return `pg_live_${hex}`;
}

export function ApiKeysPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, name, key_prefix, last_used_at, created_at")
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    setKeys(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const createKey = async () => {
    if (!user || !newKeyName.trim()) return;
    setCreating(true);
    try {
      const fullKey = randomKey();
      const key_hash = await sha256Hex(fullKey);
      const key_prefix = fullKey.slice(0, 16);
      const { error } = await supabase.from("api_keys").insert({
        user_id: user.id, name: newKeyName.trim(), key_prefix, key_hash,
      });
      if (error) throw error;
      setRevealedKey(fullKey);
      setNewKeyName("");
      setCreateOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.from("api_keys")
      .update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Key revoked" }); load(); }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> API Keys
          </CardTitle>
          <CardDescription>
            Create campaigns and send emails programmatically.{" "}
            <Link to="/api-docs" className="text-primary underline">View docs</Link>
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New key
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No API keys yet.</p>
        ) : (
          <div className="space-y-2">
            {keys.map(k => (
              <div key={k.id} className="flex items-center justify-between rounded-md border border-border p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{k.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{k.key_prefix}…</p>
                  <p className="text-xs text-muted-foreground">
                    {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleString()}` : "Never used"}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => revoke(k.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>Give your key a name so you can recognise it later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="e.g. Zapier, Production server" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createKey} disabled={creating || !newKeyName.trim()}>
              {creating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revealedKey} onOpenChange={o => !o && setRevealedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your API key</DialogTitle>
            <DialogDescription>
              This key will only be shown once. Store it somewhere safe.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-3">
            <code className="flex-1 text-xs break-all">{revealedKey}</code>
            <Button size="icon" variant="ghost" onClick={() => revealedKey && copy(revealedKey)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealedKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

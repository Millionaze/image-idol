import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Inbox as InboxIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/** Strip residual MIME artifacts that may survive server-side parsing */
function cleanBody(raw: string | null): string {
  if (!raw) return "";
  return raw
    .replace(/^Content-Type:.*$/gim, "")
    .replace(/^Content-Transfer-Encoding:.*$/gim, "")
    .replace(/^Content-Disposition:.*$/gim, "")
    .replace(/^MIME-Version:.*$/gim, "")
    .replace(/--[a-zA-Z0-9_=.+-]{10,}--?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function InboxPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedMsg, setSelectedMsg] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("email_accounts").select("id, name, email").then(({ data, error }) => {
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      setAccounts(data || []);
      if (data && data.length > 0) setSelectedAccountId(data[0].id);
      setLoadingAccounts(false);
    });
  }, [user]);

  const loadMessages = async (accountId: string) => {
    if (!accountId) return;
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase.from("inbox_messages").select("*").eq("account_id", accountId)
        .order("received_at", { ascending: false }).limit(50);
      if (error) throw error;
      setMessages(data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (selectedAccountId) loadMessages(selectedAccountId);
  }, [selectedAccountId]);

  const syncInbox = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("inbox-sync", { body: { account_id: selectedAccountId } });
      if (error) throw error;
      toast({ title: "Sync complete", description: data?.message || "Messages synced" });
      await loadMessages(selectedAccountId);
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const selectMessage = async (msg: any) => {
    setSelectedMsg(msg);
    if (!msg.is_read) {
      try {
        await supabase.from("inbox_messages").update({ is_read: true }).eq("id", msg.id);
        setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, is_read: true } : m));
      } catch (e) {
        // silent — non-critical
      }
    }
  };

  if (loadingAccounts) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inbox</h1>
        <div className="flex items-center gap-3">
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name} ({a.email})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={syncInbox} disabled={syncing || !selectedAccountId} className="gap-2">
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            Sync
          </Button>
        </div>
      </div>

      {loadingMessages ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : messages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <InboxIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="font-medium text-lg mb-1">No messages</p>
            <p className="text-muted-foreground text-sm">Click Sync to fetch your inbox</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-5 border border-border rounded-lg overflow-hidden">
          <div className="lg:col-span-2 border-r border-border max-h-[600px] overflow-auto bg-card">
            {messages.map((msg) => (
              <div
                key={msg.id}
                onClick={() => selectMessage(msg)}
                className={cn(
                  "p-4 cursor-pointer border-b border-border hover:bg-secondary transition-colors",
                  selectedMsg?.id === msg.id && "bg-secondary",
                  !msg.is_read && "border-l-2 border-l-primary"
                )}
              >
                <p className={cn("text-sm truncate", !msg.is_read && "font-semibold")}>{msg.from_name || msg.from_email}</p>
                <p className="text-sm truncate">{msg.subject || "(no subject)"}</p>
                <p className="text-xs text-muted-foreground mt-1">{new Date(msg.received_at).toLocaleString()}</p>
              </div>
            ))}
          </div>

          <div className="lg:col-span-3 p-6 min-h-[400px] bg-card">
            {selectedMsg ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">{selectedMsg.subject || "(no subject)"}</h2>
                  <p className="text-sm text-muted-foreground">
                    From: {selectedMsg.from_name} &lt;{selectedMsg.from_email}&gt;
                  </p>
                  <p className="text-xs text-muted-foreground">{new Date(selectedMsg.received_at).toLocaleString()}</p>
                </div>
                <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap text-sm text-foreground">
                  {cleanBody(selectedMsg.body) || "(empty)"}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Select a message to read
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

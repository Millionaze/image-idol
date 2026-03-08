import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Inbox as InboxIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function InboxPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedMsg, setSelectedMsg] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("email_accounts").select("id, name, email").then(({ data }) => {
      setAccounts(data || []);
      if (data && data.length > 0) setSelectedAccountId(data[0].id);
    });
  }, [user]);

  useEffect(() => {
    if (!selectedAccountId) return;
    supabase.from("inbox_messages").select("*").eq("account_id", selectedAccountId)
      .order("received_at", { ascending: false }).limit(50)
      .then(({ data }) => setMessages(data || []));
  }, [selectedAccountId]);

  const syncInbox = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("inbox-sync", { body: { account_id: selectedAccountId } });
      if (error) throw error;
      toast({ title: "Sync complete", description: data?.message || "Messages synced" });
      // Reload messages
      const { data: msgs } = await supabase.from("inbox_messages").select("*").eq("account_id", selectedAccountId)
        .order("received_at", { ascending: false }).limit(50);
      setMessages(msgs || []);
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

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

      {messages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <InboxIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No messages. Hit Sync to fetch recent emails.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-5 border border-border rounded-lg overflow-hidden">
          {/* Message list */}
          <div className="lg:col-span-2 border-r border-border max-h-[600px] overflow-auto bg-card">
            {messages.map((msg) => (
              <div
                key={msg.id}
                onClick={() => setSelectedMsg(msg)}
                className={cn(
                  "p-4 cursor-pointer border-b border-border hover:bg-secondary transition-colors",
                  selectedMsg?.id === msg.id && "bg-secondary",
                  !msg.is_read && "border-l-2 border-l-primary"
                )}
              >
                <p className="text-sm font-medium truncate">{msg.from_name || msg.from_email}</p>
                <p className="text-sm truncate">{msg.subject || "(no subject)"}</p>
                <p className="text-xs text-muted-foreground mt-1">{new Date(msg.received_at).toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* Message body */}
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
                  {selectedMsg.body || "(empty)"}
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

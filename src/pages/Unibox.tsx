import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Inbox, Send, CheckCheck, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

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

export default function Unibox() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedMsg, setSelectedMsg] = useState<any>(null);
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterTab, setFilterTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const syncingRef = useRef(false);

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [accRes, msgRes] = await Promise.all([
        supabase.from("email_accounts").select("id, name, email, smtp_host, smtp_port, smtp_secure, username, password"),
        supabase.from("inbox_messages").select("*, email_accounts(name, email)").order("received_at", { ascending: false }).limit(200),
      ]);
      setAccounts(accRes.data || []);
      setMessages(msgRes.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [user]);

  const filteredMessages = useMemo(() => {
    let msgs = messages;
    if (filterAccount !== "all") {
      msgs = msgs.filter((m) => m.account_id === filterAccount);
    }
    if (filterTab === "unread") {
      msgs = msgs.filter((m) => !m.is_read);
    } else if (filterTab === "warmup") {
      msgs = msgs.filter((m) => m.is_warmup);
    } else if (filterTab === "replies") {
      msgs = msgs.filter((m) => !m.is_warmup);
    }
    return msgs;
  }, [messages, filterAccount, filterTab]);

  const unreadCount = useMemo(() =>
    messages.filter((m) => !m.is_read && !m.is_warmup).length
  , [messages]);

  const selectMessage = async (msg: any) => {
    setSelectedMsg(msg);
    setReplyText("");
    if (!msg.is_read) {
      try {
        await supabase.from("inbox_messages").update({ is_read: true }).eq("id", msg.id);
        setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, is_read: true } : m));
      } catch { /* silent */ }
    }
  };

  const sendReply = async () => {
    if (!selectedMsg || !replyText.trim()) return;
    setReplying(true);
    try {
      const account = accounts.find((a) => a.id === selectedMsg.account_id);
      if (!account) throw new Error("Account not found");

      const { error } = await supabase.functions.invoke("send-campaign", {
        body: {
          direct_send: true,
          from_email: account.email,
          to_email: selectedMsg.from_email,
          subject: `Re: ${selectedMsg.subject || ""}`,
          body: replyText,
          smtp_host: account.smtp_host,
          smtp_port: account.smtp_port,
          smtp_secure: account.smtp_secure,
          username: account.username,
          password: account.password,
        },
      });
      if (error) throw error;
      toast({ title: "Reply sent" });
      setReplyText("");
    } catch (e: any) {
      toast({ title: "Reply failed", description: e.message, variant: "destructive" });
    } finally {
      setReplying(false);
    }
  };

  const syncAll = useCallback(async (silent = false) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      for (const acc of accounts) {
        await supabase.functions.invoke("inbox-sync", { body: { account_id: acc.id } });
      }
      await loadAll();
      setLastSynced(new Date());
      if (!silent) toast({ title: "Sync complete" });
    } catch (e: any) {
      if (!silent) toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }
  }, [accounts]);

  // Auto-sync every 2 minutes
  useEffect(() => {
    if (!accounts.length) return;
    const interval = setInterval(() => syncAll(true), 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [accounts, syncAll]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-[500px]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Unibox</h1>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-xs">{unreadCount} unread</Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastSynced && (
            <span className="text-xs text-muted-foreground">
              Synced {formatDistanceToNow(lastSynced, { addSuffix: true })}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => syncAll(false)} disabled={syncing} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            Sync All
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Select value={filterAccount} onValueChange={setFilterAccount}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tabs value={filterTab} onValueChange={setFilterTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread</TabsTrigger>
            <TabsTrigger value="warmup">Warmup</TabsTrigger>
            <TabsTrigger value="replies">Replies</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {filteredMessages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="font-medium text-lg mb-1">No messages</p>
            <p className="text-muted-foreground text-sm">Click Sync All to fetch messages from all accounts</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-5 border border-border rounded-lg overflow-hidden min-h-[500px]">
          <div className="lg:col-span-2 border-r border-border max-h-[600px] overflow-auto bg-card">
            {filteredMessages.map((msg) => (
              <div
                key={msg.id}
                onClick={() => selectMessage(msg)}
                className={cn(
                  "p-3 cursor-pointer border-b border-border hover:bg-secondary transition-colors",
                  selectedMsg?.id === msg.id && "bg-secondary",
                  !msg.is_read && "border-l-2 border-l-primary"
                )}
              >
                <div className="flex items-center gap-2">
                  <p className={cn("text-sm truncate flex-1", !msg.is_read && "font-semibold")}>{msg.from_name || msg.from_email}</p>
                  {msg.is_warmup && <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">warmup</Badge>}
                  {msg.email_accounts && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">{msg.email_accounts.name}</Badge>
                  )}
                </div>
                <p className="text-sm truncate text-muted-foreground">{msg.subject || "(no subject)"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{new Date(msg.received_at).toLocaleString()}</p>
              </div>
            ))}
          </div>

          <div className="lg:col-span-3 flex flex-col min-h-[400px] bg-card">
            {selectedMsg ? (
              <>
                <div className="p-5 flex-1 overflow-auto space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold">{selectedMsg.subject || "(no subject)"}</h2>
                    <p className="text-sm text-muted-foreground">
                      From: {selectedMsg.from_name} &lt;{selectedMsg.from_email}&gt;
                    </p>
                    <p className="text-xs text-muted-foreground">
                      To: {selectedMsg.email_accounts?.email || "—"} · {new Date(selectedMsg.received_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap text-sm text-foreground">
                    {cleanBody(selectedMsg.body) || "(empty)"}
                  </div>
                </div>

                <div className="border-t border-border p-4 space-y-2">
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your reply..."
                    rows={3}
                    className="resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await supabase.from("inbox_messages").update({ is_read: true }).eq("id", selectedMsg.id);
                        setMessages((prev) => prev.map((m) => m.id === selectedMsg.id ? { ...m, is_read: true } : m));
                        toast({ title: "Marked as read" });
                      }}
                      className="gap-1.5"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark Read
                    </Button>
                    <Button onClick={sendReply} disabled={replying || !replyText.trim()} size="sm" className="gap-1.5">
                      {replying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Reply
                    </Button>
                  </div>
                </div>
              </>
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

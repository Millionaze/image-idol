import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  RefreshCw,
  Inbox as InboxIcon,
  Send,
  MailOpen,
  Mail,
  Archive,
  UserPlus,
  MoreVertical,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

type Account = {
  id: string;
  name: string | null;
  email: string;
  imap_host: string | null;
};

type Msg = {
  id: string;
  account_id: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  body: string | null;
  body_html: string | null;
  received_at: string;
  is_read: boolean;
  is_replied: boolean;
  is_archived: boolean;
  is_outbound: boolean;
  is_warmup: boolean;
  thread_id: string | null;
  message_id: string | null;
  message_uid: string;
};

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

function initials(name: string | null, email: string | null): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

function ensureRePrefix(subject: string | null): string {
  const s = (subject || "").trim();
  if (!s) return "Re: (no subject)";
  return /^re:\s*/i.test(s) ? s : `Re: ${s}`;
}

export default function InboxPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [unreadByAccount, setUnreadByAccount] = useState<Record<string, number>>({});
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  const [messages, setMessages] = useState<Msg[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyText, setReplyText] = useState("");

  const threadEndRef = useRef<HTMLDivElement>(null);

  // Load accounts + campaigns
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: accs }, { data: camps }] = await Promise.all([
        supabase.from("email_accounts").select("id, name, email, imap_host").order("email"),
        supabase.from("campaigns").select("id, name").order("created_at", { ascending: false }),
      ]);
      setAccounts(accs || []);
      setCampaigns(camps || []);
      if (accs && accs.length > 0) setSelectedAccountId(accs[0].id);
      setLoadingAccounts(false);
    })();
  }, [user]);

  // Refresh unread counts per account
  const refreshUnreadCounts = async () => {
    if (accounts.length === 0) return;
    const counts: Record<string, number> = {};
    await Promise.all(
      accounts.map(async (a) => {
        const { count } = await supabase
          .from("inbox_messages")
          .select("*", { count: "exact", head: true })
          .eq("account_id", a.id)
          .eq("is_read", false)
          .eq("is_archived", false)
          .eq("is_warmup", false)
          .eq("is_outbound", false);
        counts[a.id] = count || 0;
      }),
    );
    setUnreadByAccount(counts);
  };

  useEffect(() => {
    refreshUnreadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  // Load messages for selected account
  const loadMessages = async (accountId: string) => {
    if (!accountId) return;
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from("inbox_messages")
        .select("*")
        .eq("account_id", accountId)
        .eq("is_warmup", false)
        .order("received_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setMessages((data as Msg[]) || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (selectedAccountId) {
      loadMessages(selectedAccountId);
      setSelectedThreadId(null);
    }
  }, [selectedAccountId]);

  // Realtime subscription on inbox_messages
  useEffect(() => {
    if (!selectedAccountId) return;
    const channel = supabase
      .channel(`inbox-${selectedAccountId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inbox_messages", filter: `account_id=eq.${selectedAccountId}` },
        () => {
          loadMessages(selectedAccountId);
          refreshUnreadCounts();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId]);

  // Group into threads (latest message per thread_id, in received_at desc)
  const threads = useMemo(() => {
    const filtered = messages.filter((m) =>
      showArchived ? m.is_archived : !m.is_archived,
    );
    const byThread = new Map<string, Msg[]>();
    for (const m of filtered) {
      const key = m.thread_id || m.message_id || m.message_uid;
      const list = byThread.get(key) || [];
      list.push(m);
      byThread.set(key, list);
    }
    const result: { threadId: string; latest: Msg; unreadCount: number; count: number }[] = [];
    byThread.forEach((list, threadId) => {
      const sorted = [...list].sort(
        (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime(),
      );
      const unread = sorted.filter((m) => !m.is_read && !m.is_outbound).length;
      result.push({ threadId, latest: sorted[0], unreadCount: unread, count: sorted.length });
    });
    result.sort(
      (a, b) => new Date(b.latest.received_at).getTime() - new Date(a.latest.received_at).getTime(),
    );
    return result;
  }, [messages, showArchived]);

  const selectedThread = useMemo(() => {
    if (!selectedThreadId) return [];
    return messages
      .filter((m) => (m.thread_id || m.message_id || m.message_uid) === selectedThreadId)
      .sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());
  }, [messages, selectedThreadId]);

  const originalForReply = useMemo(() => {
    // Last inbound message in the thread
    const inbound = [...selectedThread].reverse().find((m) => !m.is_outbound);
    return inbound || selectedThread[selectedThread.length - 1] || null;
  }, [selectedThread]);

  useEffect(() => {
    if (threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedThreadId, selectedThread.length]);

  // Mark thread read on open
  useEffect(() => {
    if (!selectedThreadId) return;
    const unread = selectedThread.filter((m) => !m.is_read && !m.is_outbound);
    if (unread.length === 0) return;
    (async () => {
      await supabase
        .from("inbox_messages")
        .update({ is_read: true })
        .in("id", unread.map((m) => m.id));
      setMessages((prev) =>
        prev.map((m) => (unread.find((u) => u.id === m.id) ? { ...m, is_read: true } : m)),
      );
      refreshUnreadCounts();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId]);

  const syncInbox = async () => {
    if (!selectedAccountId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("inbox-sync", {
        body: { account_id: selectedAccountId },
      });
      if (error) throw error;
      toast({ title: "Sync complete", description: data?.message || "Messages synced" });
      await loadMessages(selectedAccountId);
      await refreshUnreadCounts();
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const toggleRead = async (msg: Msg) => {
    const next = !msg.is_read;
    await supabase.from("inbox_messages").update({ is_read: next }).eq("id", msg.id);
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_read: next } : m)));
    refreshUnreadCounts();
  };

  const archiveMessage = async (msg: Msg) => {
    await supabase.from("inbox_messages").update({ is_archived: true }).eq("id", msg.id);
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_archived: true } : m)));
    if (selectedThreadId === (msg.thread_id || msg.message_id || msg.message_uid)) {
      setSelectedThreadId(null);
    }
    toast({ title: "Archived" });
  };

  const addToCrm = async (msg: Msg, campaignId: string) => {
    if (!msg.from_email) return;
    const { error } = await supabase.from("contacts").insert({
      campaign_id: campaignId,
      email: msg.from_email,
      name: msg.from_name || null,
      status: "pending" as any,
    });
    if (error) {
      toast({ title: "Add to CRM failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Contact added", description: msg.from_email });
    }
  };

  const sendReply = async () => {
    if (!originalForReply || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-reply", {
        body: { message_id: originalForReply.id, reply_text: replyText },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Reply sent" });
      setReplyText("");
      await loadMessages(selectedAccountId);
      await refreshUnreadCounts();
    } catch (e: any) {
      toast({ title: "Reply failed", description: e.message, variant: "destructive" });
    } finally {
      setSendingReply(false);
    }
  };

  if (loadingAccounts) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <InboxIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">No email accounts</p>
          <p className="text-sm text-muted-foreground">Add an account in Accounts to start using the inbox.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inbox</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Showing archived" : "Show archived"}
          </Button>
          <Button variant="outline" onClick={syncInbox} disabled={syncing || !selectedAccountId} className="gap-2">
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            Sync
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_360px_1fr] gap-0 border border-border rounded-lg overflow-hidden bg-card h-[calc(100vh-180px)] min-h-[500px]">
        {/* Accounts panel */}
        <div className="border-r border-border overflow-auto">
          <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border">
            Accounts
          </div>
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedAccountId(a.id)}
              className={cn(
                "w-full text-left px-3 py-3 border-b border-border hover:bg-secondary transition-colors",
                selectedAccountId === a.id && "bg-secondary border-l-2 border-l-primary",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{a.name || a.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                </div>
                {unreadByAccount[a.id] > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 min-w-[18px] flex items-center justify-center">
                    {unreadByAccount[a.id]}
                  </Badge>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Thread list */}
        <div className="border-r border-border overflow-auto">
          <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border flex items-center justify-between">
            <span>{showArchived ? "Archived" : "Inbox"}</span>
            <span>{threads.length}</span>
          </div>
          {loadingMessages ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 text-center">
              <InboxIcon className="h-8 w-8 mb-2" />
              <p className="text-sm">No messages</p>
              <p className="text-xs">Click Sync to fetch your inbox</p>
            </div>
          ) : (
            threads.map(({ threadId, latest, unreadCount, count }) => (
              <div
                key={threadId}
                onClick={() => setSelectedThreadId(threadId)}
                className={cn(
                  "group p-3 cursor-pointer border-b border-border hover:bg-secondary transition-colors",
                  selectedThreadId === threadId && "bg-secondary",
                  unreadCount > 0 && "border-l-2 border-l-primary",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={cn("text-sm truncate", unreadCount > 0 && "font-semibold")}>
                        {latest.from_name || latest.from_email || "(unknown)"}
                      </p>
                      {count > 1 && (
                        <span className="text-[10px] text-muted-foreground">({count})</span>
                      )}
                      {latest.is_replied && (
                        <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                      )}
                    </div>
                    <p className={cn("text-sm truncate", unreadCount > 0 && "font-medium")}>
                      {latest.subject || "(no subject)"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {(cleanBody(latest.body).split("\n")[0] || "").substring(0, 80)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(latest.received_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => toggleRead(latest)}>
                          {latest.is_read ? <Mail className="h-4 w-4 mr-2" /> : <MailOpen className="h-4 w-4 mr-2" />}
                          Mark as {latest.is_read ? "unread" : "read"}
                        </DropdownMenuItem>
                        {campaigns.length > 0 && latest.from_email && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-xs">Add to campaign</DropdownMenuLabel>
                            {campaigns.slice(0, 5).map((c) => (
                              <DropdownMenuItem key={c.id} onClick={() => addToCrm(latest, c.id)}>
                                <UserPlus className="h-4 w-4 mr-2" />
                                {c.name}
                              </DropdownMenuItem>
                            ))}
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => archiveMessage(latest)}>
                          <Archive className="h-4 w-4 mr-2" />
                          Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Thread view + reply */}
        <div className="flex flex-col min-h-0">
          {!selectedThreadId || selectedThread.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Select a thread to read
            </div>
          ) : (
            <>
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-base font-semibold truncate">
                  {selectedThread[0].subject || "(no subject)"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {selectedThread.length} message{selectedThread.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                {selectedThread.map((msg) => (
                  <div key={msg.id} className="flex gap-3">
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0",
                      msg.is_outbound ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
                    )}>
                      {initials(msg.from_name, msg.from_email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {msg.is_outbound ? "You" : (msg.from_name || msg.from_email)}
                        </span>
                        {!msg.is_outbound && msg.from_email && (
                          <span className="text-xs text-muted-foreground">&lt;{msg.from_email}&gt;</span>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {new Date(msg.received_at).toLocaleString()}
                        </span>
                      </div>
                      {msg.body || !msg.body_html ? (
                        <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                          {cleanBody(msg.body) || "(empty)"}
                        </div>
                      ) : (
                        <iframe
                          srcDoc={msg.body_html}
                          sandbox=""
                          className="mt-2 w-full min-h-[200px] bg-background rounded border border-border"
                          title={`message-${msg.id}`}
                        />
                      )}
                    </div>
                  </div>
                ))}
                <div ref={threadEndRef} />
              </div>

              {/* Reply box */}
              {originalForReply && originalForReply.from_email && (
                <div className="border-t border-border p-4 bg-background/50">
                  <div className="flex items-center gap-2 mb-2 flex-wrap text-xs">
                    <span className="text-muted-foreground">To:</span>
                    <Badge variant="outline">{originalForReply.from_email}</Badge>
                    <span className="text-muted-foreground ml-2">Subject:</span>
                    <Badge variant="outline" className="truncate max-w-[300px]">
                      {ensureRePrefix(originalForReply.subject)}
                    </Badge>
                  </div>
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write your reply..."
                    rows={4}
                    className="mb-2"
                  />
                  <div className="flex justify-end">
                    <Button onClick={sendReply} disabled={sendingReply || !replyText.trim()} className="gap-2">
                      <Send className={cn("h-4 w-4", sendingReply && "animate-pulse")} />
                      {sendingReply ? "Sending..." : "Send Reply"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

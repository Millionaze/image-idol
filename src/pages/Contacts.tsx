import { useState, useCallback, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Plus, Upload, Trash2, Tag, Search, Download, Users, X, Filter, Megaphone, FileUp } from "lucide-react";

interface ContactList {
  id: string;
  user_id: string;
  name: string;
  description: string;
  created_at: string;
}

interface ListContact {
  id: string;
  list_id: string;
  email: string;
  name: string | null;
  company: string | null;
  tags: string[];
  created_at: string;
}

export default function Contacts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [showNewListDialog, setShowNewListDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showAddContactDialog, setShowAddContactDialog] = useState(false);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");
  const [csvText, setCsvText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [newContact, setNewContact] = useState({ email: "", name: "", company: "", tags: "" });
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [bulkTag, setBulkTag] = useState("");
  const [tagTarget, setTagTarget] = useState<string | null>(null);
  const [singleTag, setSingleTag] = useState("");

  // Fetch lists
  const { data: lists = [] } = useQuery({
    queryKey: ["contact_lists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_lists")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ContactList[];
    },
    enabled: !!user,
  });

  // Fetch contacts for selected list
  const { data: contacts = [] } = useQuery({
    queryKey: ["list_contacts", selectedListId],
    queryFn: async () => {
      if (!selectedListId) return [];
      const { data, error } = await supabase
        .from("list_contacts")
        .select("*")
        .eq("list_id", selectedListId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ListContact[];
    },
    enabled: !!selectedListId,
  });

  // All unique tags across current list
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    contacts.forEach((c) => c.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [contacts]);

  // Filtered contacts
  const filteredContacts = useMemo(() => {
    let result = contacts;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.email.toLowerCase().includes(q) ||
          (c.name && c.name.toLowerCase().includes(q)) ||
          (c.company && c.company.toLowerCase().includes(q))
      );
    }
    if (tagFilter !== "all") {
      result = result.filter((c) => c.tags.includes(tagFilter));
    }
    return result;
  }, [contacts, searchQuery, tagFilter]);

  // Mutations
  const createList = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contact_lists").insert({
        user_id: user!.id,
        name: newListName.trim(),
        description: newListDesc.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact_lists"] });
      setShowNewListDialog(false);
      setNewListName("");
      setNewListDesc("");
      toast({ title: "List created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteList = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contact_lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact_lists"] });
      setSelectedListId(null);
      toast({ title: "List deleted" });
    },
  });

  const addContact = useMutation({
    mutationFn: async () => {
      const tags = newContact.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const { error } = await supabase.from("list_contacts").insert({
        list_id: selectedListId!,
        email: newContact.email.trim(),
        name: newContact.name.trim() || null,
        company: newContact.company.trim() || null,
        tags,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list_contacts", selectedListId] });
      setShowAddContactDialog(false);
      setNewContact({ email: "", name: "", company: "", tags: "" });
      toast({ title: "Contact added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("list_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list_contacts", selectedListId] });
    },
  });

  const importCsv = useMutation({
    mutationFn: async () => {
      const lines = csvText.trim().split("\n").filter(Boolean);
      const rows: { list_id: string; email: string; name: string | null; company: string | null; tags: string[] }[] = [];
      for (const line of lines) {
        const parts = line.split(",").map((s) => s.trim());
        const email = parts[0];
        if (!email || !email.includes("@")) continue;
        rows.push({
          list_id: selectedListId!,
          email,
          name: parts[1] || null,
          company: parts[2] || null,
          tags: parts[3] ? parts[3].split(";").map((t) => t.trim()).filter(Boolean) : [],
        });
      }
      if (rows.length === 0) throw new Error("No valid emails found");
      // Insert in batches of 100
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase.from("list_contacts").upsert(batch, { onConflict: "list_id,email" });
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["list_contacts", selectedListId] });
      setShowImportDialog(false);
      setCsvText("");
      toast({ title: `${count} contacts imported` });
    },
    onError: (e: Error) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  const applyBulkTag = useMutation({
    mutationFn: async () => {
      const tag = bulkTag.trim();
      if (!tag) throw new Error("Enter a tag");
      const ids = Array.from(selectedContacts);
      const updates = contacts
        .filter((c) => ids.includes(c.id))
        .map((c) => ({
          id: c.id,
          list_id: c.list_id,
          email: c.email,
          tags: c.tags.includes(tag) ? c.tags : [...c.tags, tag],
        }));
      const { error } = await supabase.from("list_contacts").upsert(updates, { onConflict: "list_id,email" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list_contacts", selectedListId] });
      setSelectedContacts(new Set());
      setBulkTag("");
      toast({ title: "Tags applied" });
    },
  });

  const addSingleTag = useMutation({
    mutationFn: async () => {
      const tag = singleTag.trim();
      if (!tag || !tagTarget) return;
      const contact = contacts.find((c) => c.id === tagTarget);
      if (!contact || contact.tags.includes(tag)) return;
      const { error } = await supabase
        .from("list_contacts")
        .update({ tags: [...contact.tags, tag] })
        .eq("id", tagTarget);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["list_contacts", selectedListId] });
      setShowTagDialog(false);
      setSingleTag("");
      setTagTarget(null);
    },
  });

  const removeTag = useCallback(
    async (contactId: string, tag: string) => {
      const contact = contacts.find((c) => c.id === contactId);
      if (!contact) return;
      await supabase
        .from("list_contacts")
        .update({ tags: contact.tags.filter((t) => t !== tag) })
        .eq("id", contactId);
      queryClient.invalidateQueries({ queryKey: ["list_contacts", selectedListId] });
    },
    [contacts, selectedListId, queryClient]
  );

  const exportCsv = useCallback(() => {
    const header = "email,name,company,tags";
    const rows = filteredContacts.map(
      (c) => `${c.email},${c.name || ""},${c.company || ""},${c.tags.join(";")}`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredContacts]);

  const toggleSelect = (id: string) => {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedContacts.size === filteredContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(filteredContacts.map((c) => c.id)));
    }
  };

  const selectedList = lists.find((l) => l.id === selectedListId);

  // Count contacts per list
  const listContactCounts = useQuery({
    queryKey: ["list_contact_counts"],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      for (const list of lists) {
        const { count } = await supabase
          .from("list_contacts")
          .select("*", { count: "exact", head: true })
          .eq("list_id", list.id);
        counts[list.id] = count || 0;
      }
      return counts;
    },
    enabled: lists.length > 0,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground">Manage contact lists, import CSV files, tag and segment your audience.</p>
        </div>
        <Dialog open={showNewListDialog} onOpenChange={setShowNewListDialog}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New List</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Contact List</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder="List name" value={newListName} onChange={(e) => setNewListName(e.target.value)} />
              <Input placeholder="Description (optional)" value={newListDesc} onChange={(e) => setNewListDesc(e.target.value)} />
            </div>
            <DialogFooter>
              <Button onClick={() => createList.mutate()} disabled={!newListName.trim() || createList.isPending}>
                {createList.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Lists panel */}
        <div className="lg:col-span-1 space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Your Lists</h2>
          {lists.length === 0 && (
            <p className="text-sm text-muted-foreground">No lists yet. Create one to get started.</p>
          )}
          {lists.map((list) => (
            <Card
              key={list.id}
              className={`cursor-pointer transition-colors ${selectedListId === list.id ? "border-primary bg-primary/5" : "hover:border-muted-foreground/30"}`}
              onClick={() => setSelectedListId(list.id)}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-foreground">{list.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {listContactCounts.data?.[list.id] ?? "—"} contacts
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); deleteList.mutate(list.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Contacts panel */}
        <div className="lg:col-span-3">
          {!selectedList ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <p className="text-muted-foreground">Select a list to view contacts</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{selectedList.name}</CardTitle>
                      {selectedList.description && (
                        <CardDescription>{selectedList.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm"><Upload className="h-4 w-4 mr-1" />Import CSV</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Import CSV</DialogTitle></DialogHeader>
                          <p className="text-sm text-muted-foreground">
                            Format: <code className="text-xs bg-muted px-1 py-0.5 rounded">email, name, company, tags (semicolon-separated)</code>
                          </p>
                          <Textarea
                            rows={10}
                            placeholder={"john@example.com, John Doe, Acme Inc, lead;hot\njane@test.com, Jane Smith, ,"}
                            value={csvText}
                            onChange={(e) => setCsvText(e.target.value)}
                          />
                          <DialogFooter>
                            <Button onClick={() => importCsv.mutate()} disabled={!csvText.trim() || importCsv.isPending}>
                              {importCsv.isPending ? "Importing..." : "Import"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <Dialog open={showAddContactDialog} onOpenChange={setShowAddContactDialog}>
                        <DialogTrigger asChild>
                          <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
                          <div className="space-y-3">
                            <Input placeholder="Email *" value={newContact.email} onChange={(e) => setNewContact((p) => ({ ...p, email: e.target.value }))} />
                            <Input placeholder="Name" value={newContact.name} onChange={(e) => setNewContact((p) => ({ ...p, name: e.target.value }))} />
                            <Input placeholder="Company" value={newContact.company} onChange={(e) => setNewContact((p) => ({ ...p, company: e.target.value }))} />
                            <Input placeholder="Tags (comma-separated)" value={newContact.tags} onChange={(e) => setNewContact((p) => ({ ...p, tags: e.target.value }))} />
                          </div>
                          <DialogFooter>
                            <Button onClick={() => addContact.mutate()} disabled={!newContact.email.trim() || addContact.isPending}>
                              {addContact.isPending ? "Adding..." : "Add Contact"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <Button variant="outline" size="sm" onClick={exportCsv} disabled={filteredContacts.length === 0}>
                        <Download className="h-4 w-4 mr-1" />Export
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Filters */}
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-xs">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-9" placeholder="Search contacts..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    <Select value={tagFilter} onValueChange={setTagFilter}>
                      <SelectTrigger className="w-[160px]">
                        <Filter className="h-3.5 w-3.5 mr-2" />
                        <SelectValue placeholder="Filter by tag" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All tags</SelectItem>
                        {allTags.map((tag) => (
                          <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedContacts.size > 0 && (
                      <div className="flex items-center gap-2 ml-auto">
                        <span className="text-xs text-muted-foreground">{selectedContacts.size} selected</span>
                        <Input
                          className="w-32 h-8 text-sm"
                          placeholder="Add tag..."
                          value={bulkTag}
                          onChange={(e) => setBulkTag(e.target.value)}
                        />
                        <Button size="sm" variant="secondary" onClick={() => applyBulkTag.mutate()} disabled={!bulkTag.trim()}>
                          <Tag className="h-3.5 w-3.5 mr-1" />Tag
                        </Button>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Summary */}
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>{contacts.length} total</span>
                    <span>{filteredContacts.length} shown</span>
                    <span>{allTags.length} tags</span>
                  </div>

                  {/* Table */}
                  <div className="rounded-md border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="w-10">
                            <input
                              type="checkbox"
                              checked={filteredContacts.length > 0 && selectedContacts.size === filteredContacts.length}
                              onChange={toggleAll}
                              className="rounded border-border"
                            />
                          </TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead>Tags</TableHead>
                          <TableHead className="w-16"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredContacts.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                              {contacts.length === 0 ? "No contacts yet. Import a CSV or add contacts manually." : "No contacts match your filters."}
                            </TableCell>
                          </TableRow>
                        )}
                        {filteredContacts.map((contact) => (
                          <TableRow key={contact.id} className="hover:bg-muted/10">
                            <TableCell>
                              <input
                                type="checkbox"
                                checked={selectedContacts.has(contact.id)}
                                onChange={() => toggleSelect(contact.id)}
                                className="rounded border-border"
                              />
                            </TableCell>
                            <TableCell className="font-mono text-sm text-foreground">{contact.email}</TableCell>
                            <TableCell className="text-muted-foreground">{contact.name || "—"}</TableCell>
                            <TableCell className="text-muted-foreground">{contact.company || "—"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 flex-wrap">
                                {contact.tags.map((tag) => (
                                  <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1">
                                    {tag}
                                    <button onClick={() => removeTag(contact.id, tag)} className="hover:text-destructive">
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                ))}
                                <button
                                  onClick={() => { setTagTarget(contact.id); setShowTagDialog(true); }}
                                  className="text-muted-foreground hover:text-primary"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => deleteContact.mutate(contact.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Single tag dialog */}
      <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Tag</DialogTitle></DialogHeader>
          <Input placeholder="Tag name" value={singleTag} onChange={(e) => setSingleTag(e.target.value)} />
          <DialogFooter>
            <Button onClick={() => addSingleTag.mutate()} disabled={!singleTag.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

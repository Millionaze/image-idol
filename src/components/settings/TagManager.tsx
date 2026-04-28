import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { ColorPicker, colorClass } from "@/components/shared/ColorPicker";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export function TagManager() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("blue");

  const { data: tags = [] } = useQuery({
    queryKey: ["tags_with_usage"],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("tags").select("id, name, color").order("name");
      if (error) throw error;
      const { data: links } = await supabase.from("contact_tags").select("tag_id");
      const counts: Record<string, number> = {};
      (links ?? []).forEach((l: any) => { counts[l.tag_id] = (counts[l.tag_id] ?? 0) + 1; });
      return (rows as any[]).map((t) => ({ ...t, usage: counts[t.id] ?? 0 }));
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error("Name required");
      const { error } = await supabase.from("tags").insert({ user_id: user!.id, name: newName.trim().toLowerCase(), color: newColor });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tags_with_usage"] }); qc.invalidateQueries({ queryKey: ["tags"] }); setNewName(""); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: async ({ id, color }: { id: string; color: string }) => {
      const { error } = await supabase.from("tags").update({ color }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags_with_usage"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("contact_tags").delete().eq("tag_id", id);
      const { error } = await supabase.from("tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags_with_usage"] }),
  });

  const filtered = tags.filter((t) => !search || t.name.includes(search.toLowerCase()));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tags</CardTitle>
        <CardDescription>Categorise contacts to power workflow triggers and filters.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 items-end">
          <Input placeholder="New tag name…" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-9" />
          <ColorPicker value={newColor} onChange={setNewColor} />
          <Button size="sm" onClick={() => create.mutate()}><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>
        <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9" />
        <div className="space-y-1 max-h-[420px] overflow-y-auto">
          {filtered.map((t) => (
            <div key={t.id} className="flex items-center gap-2 border border-border rounded-md p-2">
              <ColorPicker value={t.color} onChange={(c) => update.mutate({ id: t.id, color: c })} />
              <span className="flex-1 text-sm font-medium">{t.name}</span>
              <Badge variant="outline" className="text-[10px]">{t.usage} contacts</Badge>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{t.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>This will remove the tag from {t.usage} contacts.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.mutate(t.id)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No tags.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

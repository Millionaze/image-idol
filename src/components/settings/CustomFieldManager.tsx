import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TYPES = ["text", "number", "date", "boolean", "select", "url"];

const toKey = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function CustomFieldManager() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [options, setOptions] = useState<string[]>([]);

  const { data: fields = [] } = useQuery({
    queryKey: ["custom_fields_with_usage"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("custom_field_definitions").select("*").order("label");
      if (error) throw error;
      const { data: vals } = await supabase.from("contact_custom_values").select("field_id");
      const counts: Record<string, number> = {};
      (vals ?? []).forEach((v: any) => { counts[v.field_id] = (counts[v.field_id] ?? 0) + 1; });
      return (data as any[]).map((f) => ({ ...f, usage: counts[f.id] ?? 0 }));
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const key = toKey(label);
      if (!key) throw new Error("Invalid label");
      const { error } = await supabase.from("custom_field_definitions").insert({
        user_id: user!.id, key, label, field_type: type,
        options: type === "select" ? options : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom_fields_with_usage"] });
      qc.invalidateQueries({ queryKey: ["custom_fields_min"] });
      qc.invalidateQueries({ queryKey: ["custom_fields_all"] });
      setOpen(false); setLabel(""); setType("text"); setOptions([]);
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("contact_custom_values").delete().eq("field_id", id);
      const { error } = await supabase.from("custom_field_definitions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom_fields_with_usage"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Custom Fields</CardTitle>
        <CardDescription>Store extra data on contacts. Reference in workflows as <code className="text-xs">{`{{custom.<key>}}`}</code>.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New field</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New custom field</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Label</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Industry" />
                {label && <p className="text-xs text-muted-foreground mt-1">key: <code>{toKey(label)}</code></p>}
              </div>
              <div>
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {type === "select" && (
                <div>
                  <Label>Options</Label>
                  <div className="space-y-1 mt-1">
                    {options.map((o, i) => (
                      <div key={i} className="flex gap-1">
                        <Input value={o} onChange={(e) => setOptions((arr) => arr.map((x, idx) => idx === i ? e.target.value : x))} />
                        <Button variant="ghost" size="icon" onClick={() => setOptions((arr) => arr.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setOptions((o) => [...o, ""])}><Plus className="h-4 w-4 mr-1" /> Add option</Button>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={!label}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Table>
          <TableHeader><TableRow><TableHead>Label</TableHead><TableHead>Key</TableHead><TableHead>Type</TableHead><TableHead>Usage</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {fields.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.label}</TableCell>
                <TableCell className="font-mono text-xs">{f.key}</TableCell>
                <TableCell><Badge variant="outline">{f.field_type}</Badge></TableCell>
                <TableCell>{f.usage}</TableCell>
                <TableCell>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{f.label}"?</AlertDialogTitle>
                        <AlertDialogDescription>Removes the field and all values from {f.usage} contacts.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate(f.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
            {fields.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No custom fields yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

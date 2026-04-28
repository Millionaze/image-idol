import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Plus, Tag as TagIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { colorClass } from "./ColorPicker";
import { useToast } from "@/hooks/use-toast";

export interface TagRow {
  id: string;
  name: string;
  color: string;
}

interface TagPickerProps {
  value: string[]; // tag IDs
  onChange: (next: string[]) => void;
  placeholder?: string;
  multi?: boolean;
}

export function TagPicker({ value, onChange, placeholder = "Select tags…", multi = true }: TagPickerProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: tags = [] } = useQuery({
    queryKey: ["tags", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("id, name, color").order("name");
      if (error) throw error;
      return data as TagRow[];
    },
  });

  const createTag = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("tags")
        .insert({ name: name.trim().toLowerCase(), color: "blue", user_id: user!.id })
        .select("id, name, color")
        .single();
      if (error) throw error;
      return data as TagRow;
    },
    onSuccess: (tag) => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      onChange(multi ? [...value, tag.id] : [tag.id]);
      setSearch("");
    },
    onError: (e: any) => toast({ title: "Could not create tag", description: e.message, variant: "destructive" }),
  });

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange(multi ? [...value, id] : [id]);
  };

  const selectedTags = tags.filter((t) => value.includes(t.id));
  const showCreate =
    search.trim().length > 0 &&
    !tags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start">
            <TagIcon className="h-3.5 w-3.5 mr-2" />
            {selectedTags.length === 0 ? placeholder : `${selectedTags.length} selected`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[260px]" align="start">
          <Command>
            <CommandInput placeholder="Search tags…" value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>No tags found.</CommandEmpty>
              <CommandGroup>
                {tags.map((tag) => (
                  <CommandItem key={tag.id} onSelect={() => toggle(tag.id)}>
                    <span className={cn("h-2.5 w-2.5 rounded-full mr-2", colorClass(tag.color))} />
                    <span className="flex-1">{tag.name}</span>
                    {value.includes(tag.id) && <Check className="h-4 w-4" />}
                  </CommandItem>
                ))}
                {showCreate && (
                  <CommandItem onSelect={() => createTag.mutate(search)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create "{search.trim().toLowerCase()}"
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTags.map((t) => (
            <Badge key={t.id} variant="outline" className="gap-1">
              <span className={cn("h-1.5 w-1.5 rounded-full", colorClass(t.color))} />
              {t.name}
              <button type="button" onClick={() => toggle(t.id)} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

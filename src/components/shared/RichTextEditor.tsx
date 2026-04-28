import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import tippy from "@tiptap/suggestion";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tag as TagIcon } from "lucide-react";

const MERGE_TAGS = [
  "first_name",
  "last_name",
  "name",
  "email",
  "company",
  "custom.industry",
  "custom.company_size",
];

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Mention.configure({
        HTMLAttributes: { class: "bg-primary/15 text-primary px-1 rounded" },
        renderText: ({ node }) => `{{${node.attrs.id}}}`,
        renderHTML: ({ node }) => ["span", { class: "bg-primary/15 text-primary px-1 rounded" }, `{{${node.attrs.id}}}`],
        suggestion: {
          items: ({ query }) =>
            MERGE_TAGS.filter((tag) => tag.toLowerCase().includes(query.toLowerCase())).slice(0, 8),
          render: () => {
            let popup: any;
            let component: any;
            return {
              onStart: (props: any) => {
                component = document.createElement("div");
                component.className =
                  "z-50 rounded-md border border-border bg-popover shadow-md p-1 text-sm";
                document.body.appendChild(component);
                renderItems(component, props);
                positionPopup(component, props.clientRect?.());
              },
              onUpdate(props: any) {
                renderItems(component, props);
                positionPopup(component, props.clientRect?.());
              },
              onKeyDown(props: any) {
                if (props.event.key === "Escape") {
                  component?.remove();
                  return true;
                }
                return false;
              },
              onExit() {
                component?.remove();
              },
            };
          },
        },
      }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "prose prose-invert prose-sm max-w-none min-h-[160px] focus:outline-none px-3 py-2",
      },
    },
  });

  useEffect(() => {
    if (editor && value && editor.getHTML() !== value) {
      editor.commands.setContent(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const insertMerge = (tag: string) => {
    editor?.chain().focus().insertContent(`{{${tag}}} `).run();
  };

  return (
    <div className="rounded-md border border-input bg-background">
      <div className="flex items-center gap-2 border-b border-border px-2 py-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" type="button">
              <TagIcon className="h-3.5 w-3.5 mr-1" /> Merge tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="start">
            <div className="text-xs text-muted-foreground px-2 py-1">Insert variable</div>
            {MERGE_TAGS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => insertMerge(m)}
                className="w-full text-left text-sm px-2 py-1 rounded hover:bg-accent hover:text-accent-foreground"
              >
                {`{{${m}}}`}
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground ml-auto">{placeholder}</span>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function renderItems(container: HTMLElement, props: any) {
  container.innerHTML = "";
  const items: string[] = props.items;
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "px-2 py-1 text-muted-foreground";
    empty.textContent = "No matches";
    container.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.className =
      "block w-full text-left px-2 py-1 rounded hover:bg-accent hover:text-accent-foreground";
    btn.textContent = item;
    btn.onclick = () => props.command({ id: item, label: item });
    container.appendChild(btn);
  });
}

function positionPopup(el: HTMLElement, rect?: DOMRect) {
  if (!rect) return;
  el.style.position = "absolute";
  el.style.top = `${rect.bottom + window.scrollY + 4}px`;
  el.style.left = `${rect.left + window.scrollX}px`;
}

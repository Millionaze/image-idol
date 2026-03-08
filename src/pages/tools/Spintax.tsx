import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Shuffle, Eye, Copy, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function parseSpintax(text: string): string {
  return text.replace(/\{([^{}]+)\}/g, (_, options) => {
    const parts = options.split("|");
    return parts[Math.floor(Math.random() * parts.length)];
  });
}

function countCombinations(text: string): number {
  const matches = text.match(/\{([^{}]+)\}/g);
  if (!matches) return 1;
  return matches.reduce((product, m) => {
    const parts = m.slice(1, -1).split("|").length;
    return product * parts;
  }, 1);
}

function highlightSpintax(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\{([^{}]+)\}/g;
  let lastIndex = 0;
  let match;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`t${i}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <span key={`s${i}`} className="bg-primary/20 text-primary rounded px-1 border border-primary/30">
        {match[0]}
      </span>
    );
    lastIndex = regex.lastIndex;
    i++;
  }
  if (lastIndex < text.length) {
    parts.push(<span key={`e${i}`}>{text.slice(lastIndex)}</span>);
  }
  return parts;
}

export default function Spintax() {
  const [body, setBody] = useState("Hi {{{name}}}!\n\nI {wanted to reach out|thought I'd drop a note|am writing} because {your company|your team} caught my eye.\n\n{Would love to chat|Let me know if you're interested|Happy to share more details}.\n\n{Best|Cheers|Thanks},\n{John|The Team}");
  const [previews, setPreviews] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const combinations = useMemo(() => countCombinations(body), [body]);

  const generatePreviews = () => {
    const results: string[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(parseSpintax(body));
    }
    setPreviews(results);
  };

  const addVariation = () => {
    const selection = window.getSelection()?.toString();
    if (!selection || !selection.trim()) {
      toast.error("Select text in the editor first");
      return;
    }
    const alternative = prompt("Enter an alternative phrase:");
    if (!alternative) return;
    const spintaxText = `{${selection}|${alternative}}`;
    setBody((prev) => prev.replace(selection, spintaxText));
    toast.success("Variation added!");
  };

  const aiSuggest = async () => {
    if (!body.trim()) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email-copy", {
        body: { type: "spintax", body },
      });
      if (error) throw error;
      setBody(data?.content || body);
      toast.success("AI spintax applied!");
    } catch (e: any) {
      toast.error(e.message || "AI suggestion failed");
    } finally {
      setAiLoading(false);
    }
  };

  const exportToClipboard = () => {
    navigator.clipboard.writeText(body);
    toast.success("Spintax copied to clipboard");
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Spintax Generator</h1>
        <p className="text-muted-foreground text-sm mt-1">Write emails with automatic variation using {"{option1|option2}"} syntax</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shuffle className="h-4 w-4 text-primary" />
              Editor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="font-mono text-sm"
              placeholder="Write your email with {option1|option2} syntax..."
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={addVariation}>
                Add Variation
              </Button>
              <Button variant="outline" size="sm" onClick={aiSuggest} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                AI Suggest
              </Button>
              <Button variant="outline" size="sm" onClick={exportToClipboard}>
                <Copy className="h-3 w-3 mr-1" />
                Export
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 rounded-md bg-secondary/30 border border-border text-sm whitespace-pre-wrap leading-relaxed">
              {highlightSpintax(body)}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>~{combinations.toLocaleString()} unique combinations</span>
              <span>For a 100-contact campaign</span>
            </div>
            <Button onClick={generatePreviews} size="sm">
              <Eye className="h-3 w-3 mr-1" />
              Preview 5 Variations
            </Button>

            {previews.length > 0 && (
              <div className="space-y-3 max-h-[300px] overflow-auto">
                {previews.map((p, i) => (
                  <div key={i} className="p-3 rounded-md bg-secondary/20 border border-border text-sm whitespace-pre-wrap">
                    <span className="text-xs text-primary font-medium">Variation {i + 1}</span>
                    <p className="mt-1">{p}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

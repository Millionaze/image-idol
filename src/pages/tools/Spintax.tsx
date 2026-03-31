import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Shuffle, Eye, Copy, Sparkles, Loader2, Save, AlertTriangle, CheckCircle2, FolderOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
  return matches.reduce((product, m) => product * m.slice(1, -1).split("|").length, 1);
}

function highlightSpintax(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\{([^{}]+)\}/g;
  let lastIndex = 0;
  let match;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(<span key={`t${i}`}>{text.slice(lastIndex, match.index)}</span>);
    parts.push(<span key={`s${i}`} className="bg-primary/20 text-primary rounded px-1 border border-primary/30">{match[0]}</span>);
    lastIndex = regex.lastIndex;
    i++;
  }
  if (lastIndex < text.length) parts.push(<span key={`e${i}`}>{text.slice(lastIndex)}</span>);
  return parts;
}

export default function Spintax() {
  const { user } = useAuth();
  const [mode, setMode] = useState("auto");
  const [body, setBody] = useState("");
  const [spintaxResult, setSpintaxResult] = useState("");
  const [previews, setPreviews] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [checkLoading, setCheckLoading] = useState(false);
  const [qualityIssues, setQualityIssues] = useState<Array<{ variation: string; problem: string; suggestion: string }>>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [variationDetails, setVariationDetails] = useState<Array<{ original: string; alternatives: string[] }>>([]);

  const activeText = mode === "auto" ? spintaxResult || body : body;
  const combinations = useMemo(() => countCombinations(activeText), [activeText]);

  useEffect(() => {
    if (!user) return;
    supabase.from("spintax_templates").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10)
      .then(({ data }) => { if (data) setTemplates(data); });
  }, [user]);

  const autoSpintax = async () => {
    if (!body.trim()) { toast.error("Paste an email first"); return; }
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email-copy", {
        body: { type: "spintax-auto", body },
      });
      if (error) throw error;
      const content = data?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setSpintaxResult(parsed.spintax_email || content);
        setVariationDetails(parsed.variations_applied || []);
      } else {
        setSpintaxResult(content);
      }
      toast.success("AI spintax generated!");
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setAiLoading(false);
    }
  };

  const suggestVariations = async () => {
    const selection = window.getSelection()?.toString();
    if (!selection?.trim()) { toast.error("Select text in the editor first"); return; }
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email-copy", {
        body: { type: "spintax-suggest", phrase: selection, context: body },
      });
      if (error) throw error;
      const content = data?.content || "";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const alternatives = JSON.parse(jsonMatch[0]);
        const spintaxText = `{${selection}|${alternatives.join("|")}}`;
        setBody(prev => prev.replace(selection, spintaxText));
        toast.success(`Added ${alternatives.length} variations!`);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setAiLoading(false);
    }
  };

  const checkQuality = async () => {
    const textToCheck = spintaxResult || body;
    if (!textToCheck.trim()) return;
    setCheckLoading(true);
    setQualityIssues([]);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email-copy", {
        body: { type: "spintax-check", spintax_text: textToCheck },
      });
      if (error) throw error;
      const content = data?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setQualityIssues(parsed.issues || []);
        if (parsed.issues?.length === 0) toast.success("All variations look natural!");
        else toast.warning(`${parsed.issues.length} issues found`);
      }
    } catch (e: any) {
      toast.error(e.message || "Check failed");
    } finally {
      setCheckLoading(false);
    }
  };

  const generatePreviews = () => {
    const text = spintaxResult || body;
    const results: string[] = [];
    for (let i = 0; i < 5; i++) results.push(parseSpintax(text));
    setPreviews(results);
  };

  const saveTemplate = async () => {
    if (!user || !templateName.trim()) { toast.error("Enter a template name"); return; }
    const text = spintaxResult || body;
    await supabase.from("spintax_templates").insert({
      user_id: user.id,
      name: templateName,
      raw_content: body,
      spintax_content: text,
      variation_count: countCombinations(text),
    });
    setTemplateName("");
    toast.success("Template saved!");
    const { data } = await supabase.from("spintax_templates").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
    if (data) setTemplates(data);
  };

  const loadTemplate = (t: any) => {
    setBody(t.raw_content || t.spintax_content || "");
    setSpintaxResult(t.spintax_content || "");
    toast.success("Template loaded");
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Spintax Generator</h1>
        <p className="text-muted-foreground text-sm mt-1">AI-powered email variation engine with quality checking</p>
      </div>

      <Tabs value={mode} onValueChange={setMode}>
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="auto">Auto-Spintax</TabsTrigger>
          <TabsTrigger value="manual">Manual Builder</TabsTrigger>
          <TabsTrigger value="preview">Previewer</TabsTrigger>
        </TabsList>

        {/* Auto Mode */}
        <TabsContent value="auto" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Plain Email</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="font-mono text-sm" placeholder="Paste your plain email here (no spintax yet)..." />
                <Button onClick={autoSpintax} disabled={aiLoading} className="gap-2">
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  AI Auto-Spintax
                </Button>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Spintax Result</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {spintaxResult ? (
                  <>
                    <div className="p-3 rounded-md bg-secondary/30 border border-border text-sm whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-auto">
                      {highlightSpintax(spintaxResult)}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="text-primary font-medium">~{combinations.toLocaleString()} unique emails</span>
                    </div>
                    {variationDetails.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Variations Applied:</Label>
                        {variationDetails.map((v, i) => (
                          <div key={i} className="text-xs p-2 rounded bg-secondary/20 border border-border">
                            <span className="text-muted-foreground">"{v.original}" →</span> {v.alternatives?.join(" | ")}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(spintaxResult); toast.success("Copied!"); }}>
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                      <Button variant="outline" size="sm" onClick={checkQuality} disabled={checkLoading}>
                        {checkLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                        Quality Check
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Shuffle className="h-8 w-8 mb-2" />
                    <p className="text-sm">Paste an email and click "AI Auto-Spintax"</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Manual Mode */}
        <TabsContent value="manual" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shuffle className="h-4 w-4 text-primary" />
                  Editor
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="font-mono text-sm" placeholder="Write your email with {option1|option2} syntax..." />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={suggestVariations} disabled={aiLoading}>
                    {aiLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                    AI Suggest (select text)
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(body); toast.success("Copied!"); }}>
                    <Copy className="h-3 w-3 mr-1" /> Export
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Live Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-md bg-secondary/30 border border-border text-sm whitespace-pre-wrap leading-relaxed">
                  {highlightSpintax(body)}
                </div>
                <div className="text-xs text-muted-foreground">
                  ~{combinations.toLocaleString()} unique combinations
                </div>
                <Button size="sm" onClick={generatePreviews}><Eye className="h-3 w-3 mr-1" /> Preview 5</Button>
                {previews.length > 0 && (
                  <div className="space-y-2 max-h-[200px] overflow-auto">
                    {previews.map((p, i) => (
                      <div key={i} className="p-2 rounded bg-secondary/20 border border-border text-sm whitespace-pre-wrap">
                        <span className="text-xs text-primary font-medium">#{i + 1}</span>
                        <p className="mt-1">{p}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Previewer Mode */}
        <TabsContent value="preview" className="space-y-4 mt-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Spintax Previewer & Tester</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="font-mono text-sm" placeholder="Paste spintax text here..." />
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" onClick={generatePreviews}><Eye className="h-3 w-3 mr-1" /> Render Preview</Button>
                <Button size="sm" variant="outline" onClick={checkQuality} disabled={checkLoading}>
                  {checkLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  Quality Check
                </Button>
                <span className="text-xs text-primary font-medium self-center">~{combinations.toLocaleString()} unique emails</span>
              </div>
              {previews.length > 0 && (
                <div className="space-y-2">
                  {previews.map((p, i) => (
                    <div key={i} className="p-3 rounded bg-secondary/20 border border-border text-sm whitespace-pre-wrap">
                      <span className="text-xs text-primary font-medium">Variation {i + 1}</span>
                      <p className="mt-1">{p}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quality Issues */}
      {qualityIssues.length > 0 && (
        <Card className="bg-card border-warning/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-warning">
              <AlertTriangle className="h-4 w-4" />
              {qualityIssues.length} Variations Flagged
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {qualityIssues.map((issue, i) => (
              <div key={i} className="p-3 rounded-md bg-secondary/30 border border-border">
                <p className="text-sm"><span className="text-warning">"{issue.variation}"</span></p>
                <p className="text-xs text-muted-foreground mt-1">Problem: {issue.problem}</p>
                <p className="text-xs text-primary mt-0.5">Suggestion: {issue.suggestion}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Save Template */}
      <Card className="bg-card border-border">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Input placeholder="Template name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="max-w-xs" />
            <Button variant="outline" onClick={saveTemplate} disabled={!templateName.trim()}>
              <Save className="h-4 w-4 mr-1" /> Save Template
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Saved Templates */}
      {templates.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              Saved Templates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {templates.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-md bg-secondary/30 border border-border cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => loadTemplate(t)}>
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.variation_count?.toLocaleString()} combinations</p>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PenLine, Copy, Loader2, ArrowRight, RefreshCw, Sparkles, Target, Lightbulb, HelpCircle, Clock, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Variation {
  subject: string;
  body: string;
  angle: string;
  spam_warnings: string[];
  tone_score: number;
}

const angleIcons: Record<string, React.ReactNode> = {
  pain: <Target className="h-4 w-4" />,
  outcome: <Lightbulb className="h-4 w-4" />,
  curiosity: <HelpCircle className="h-4 w-4" />,
};

const angleLabels: Record<string, string> = {
  pain: "Pain-led",
  outcome: "Outcome-led",
  curiosity: "Curiosity-led",
};

const angleColors: Record<string, string> = {
  pain: "text-destructive",
  outcome: "text-emerald-400",
  curiosity: "text-primary",
};

export default function CopyWriter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [product, setProduct] = useState("");
  const [audience, setAudience] = useState("");
  const [painPoint, setPainPoint] = useState("");
  const [customerProfile, setCustomerProfile] = useState("");
  const [goal, setGoal] = useState("Book a call");
  const [tone, setTone] = useState("Professional");
  const [length, setLength] = useState("Short (5-7 lines)");
  const [variations, setVariations] = useState<Variation[]>([]);
  const [loading, setLoading] = useState(false);
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("copy_history").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10)
      .then(({ data }) => { if (data) setHistory(data); });
  }, [user]);

  const generate = async () => {
    if (!product || !audience) { toast.error("Fill in product and audience"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email-copy", {
        body: { type: "copy", product, audience, goal, tone, length, pain_point: painPoint, customer_profile: customerProfile },
      });
      if (error) throw error;
      const content = data?.content || "";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setVariations(parsed.map((v: any) => ({
          subject: v.subject || "",
          body: v.body || "",
          angle: v.angle || "pain",
          spam_warnings: v.spam_warnings || [],
          tone_score: v.tone_score || 5,
        })));
      } else {
        setVariations([{ subject: "Generated Email", body: content, angle: "pain", spam_warnings: [], tone_score: 5 }]);
      }

      // Save to history
      if (user) {
        await supabase.from("copy_history").insert([{
          user_id: user.id,
          product_context: product,
          audience,
          goal,
          tone,
          pain_point: painPoint,
          variation_a: variations[0] || null,
          variation_b: variations[1] || null,
          variation_c: variations[2] || null,
        }]);
      }
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const regenerateVariation = async (index: number) => {
    const v = variations[index];
    setRegeneratingIdx(index);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email-copy", {
        body: { type: "regenerate-variation", product, audience, goal, tone, length, angle: v.angle, pain_point: painPoint },
      });
      if (error) throw error;
      const content = data?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setVariations(prev => prev.map((item, i) => i === index ? {
          subject: parsed.subject || item.subject,
          body: parsed.body || item.body,
          angle: parsed.angle || item.angle,
          spam_warnings: parsed.spam_warnings || [],
          tone_score: parsed.tone_score || 5,
        } : item));
      }
    } catch (e: any) {
      toast.error(e.message || "Regeneration failed");
    } finally {
      setRegeneratingIdx(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
  const readTime = (text: string) => Math.max(1, Math.round((wordCount(text) / 238) * 10) / 10);

  const saveToCampaign = (v: Variation) => {
    navigate("/campaigns", { state: { prefillSubject: v.subject, prefillBody: v.body } });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Copy Writer</h1>
          <p className="text-muted-foreground text-sm mt-1">Generate 3 angle-driven cold email variations with AI</p>
        </div>
        {history.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
            <Clock className="h-4 w-4 mr-1" />
            History ({history.length})
          </Button>
        )}
      </div>

      {/* Context Form */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PenLine className="h-4 w-4 text-primary" />
            Campaign Brief
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Product / Service *</Label>
              <Input placeholder="e.g. AI-powered email warmup tool" value={product} onChange={(e) => setProduct(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Target Audience *</Label>
              <Input placeholder="e.g. B2B SaaS founders doing cold outreach" value={audience} onChange={(e) => setAudience(e.target.value)} />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pain Point</Label>
              <Input placeholder="e.g. Emails landing in spam, low reply rates" value={painPoint} onChange={(e) => setPainPoint(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Customer Profile</Label>
              <Input placeholder="e.g. VP Sales, 50-200 employees, SaaS" value={customerProfile} onChange={(e) => setCustomerProfile(e.target.value)} />
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Goal</Label>
              <Select value={goal} onValueChange={setGoal}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Book a call">Book a call</SelectItem>
                  <SelectItem value="Get a reply">Get a reply</SelectItem>
                  <SelectItem value="Drive to website">Drive to link</SelectItem>
                  <SelectItem value="Soft introduction">Soft introduction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Casual">Casual</SelectItem>
                  <SelectItem value="Professional">Professional</SelectItem>
                  <SelectItem value="Direct">Direct</SelectItem>
                  <SelectItem value="Consultative">Consultative</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Length</Label>
              <Select value={length} onValueChange={setLength}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ultra-short (3 lines)">Ultra-short (3 lines)</SelectItem>
                  <SelectItem value="Short (5-7 lines)">Short (5-7 lines)</SelectItem>
                  <SelectItem value="Medium (2 paragraphs)">Medium (2 paragraphs)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={generate} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate 3 Variations
          </Button>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <div className="grid md:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => (
            <Card key={i} className="bg-card border-border">
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Variation Cards */}
      {variations.length > 0 && !loading && (
        <div className="grid md:grid-cols-3 gap-4">
          {variations.map((v, i) => (
            <Card key={i} className="bg-card border-border flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className={`flex items-center gap-2 text-sm font-medium ${angleColors[v.angle] || "text-primary"}`}>
                    {angleIcons[v.angle] || <Sparkles className="h-4 w-4" />}
                    {angleLabels[v.angle] || `Variation ${i + 1}`}
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(`Subject: ${v.subject}\n\n${v.body}`)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 flex flex-col">
                <div>
                  <Label className="text-xs text-muted-foreground">Subject Line</Label>
                  <p className="text-sm font-medium mt-1">{v.subject}</p>
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Body</Label>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{v.body}</p>
                </div>

                {/* Metrics */}
                <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
                  <span>{wordCount(v.body)} words</span>
                  <span>~{readTime(v.body)} min</span>
                  <span>Tone: {v.tone_score}/10</span>
                </div>

                {/* Spam Warnings */}
                {v.spam_warnings.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {v.spam_warnings.map((w, wi) => (
                      <Badge key={wi} variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30 gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {w}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Tone Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Formal</span>
                    <span>Casual</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${v.tone_score * 10}%` }} />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => regenerateVariation(i)} disabled={regeneratingIdx === i} className="gap-1">
                    {regeneratingIdx === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Regenerate
                  </Button>
                  <Button size="sm" onClick={() => saveToCampaign(v)} className="gap-1">
                    <ArrowRight className="h-3 w-3" />
                    Use in Campaign
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* History Panel */}
      {showHistory && history.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Generation History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((h: any) => (
              <div key={h.id} className="flex items-center justify-between p-3 rounded-md bg-secondary/30 border border-border">
                <div>
                  <p className="text-sm font-medium">{h.product_context}</p>
                  <p className="text-xs text-muted-foreground">{h.audience} · {h.tone} · {h.goal}</p>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {variations.length === 0 && !loading && (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <PenLine className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="font-medium text-lg mb-1">Generate your first email copy</p>
            <p className="text-muted-foreground text-sm text-center max-w-md">
              Fill in the brief above and AI will generate 3 unique variations: 
              pain-led, outcome-led, and curiosity-led — each optimized for cold outreach.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PenLine, Copy, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Variation {
  subject: string;
  body: string;
  followUp?: { subject: string; body: string };
}

export default function CopyWriter() {
  const [product, setProduct] = useState("");
  const [audience, setAudience] = useState("");
  const [goal, setGoal] = useState("Book a call");
  const [tone, setTone] = useState("Professional");
  const [length, setLength] = useState("Short (1 paragraph)");
  const [variations, setVariations] = useState<Variation[]>([]);
  const [loading, setLoading] = useState(false);
  const [followUpLoading, setFollowUpLoading] = useState<number | null>(null);
  const navigate = useNavigate();

  const generate = async () => {
    if (!product || !audience) { toast.error("Fill in product and audience"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email-copy", {
        body: { type: "copy", product, audience, goal, tone, length },
      });
      if (error) throw error;
      const content = data?.content || "";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        setVariations(JSON.parse(jsonMatch[0]));
      } else {
        setVariations([{ subject: "Generated Email", body: content }]);
      }
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const generateFollowUp = async (index: number) => {
    const v = variations[index];
    setFollowUpLoading(index);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email-copy", {
        body: { type: "follow-up", originalSubject: v.subject, originalBody: v.body, tone },
      });
      if (error) throw error;
      const content = data?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const followUp = jsonMatch ? JSON.parse(jsonMatch[0]) : { subject: "Follow-up", body: content };
      setVariations((prev) => prev.map((item, i) => (i === index ? { ...item, followUp } : item)));
    } catch (e: any) {
      toast.error(e.message || "Follow-up generation failed");
    } finally {
      setFollowUpLoading(null);
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
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">AI Copy Writer</h1>
        <p className="text-muted-foreground text-sm mt-1">Generate cold email copy with AI-powered variations</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PenLine className="h-4 w-4 text-primary" />
            Email Brief
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Your Product / Service</Label>
              <Input placeholder="e.g. Project management software for remote teams" value={product} onChange={(e) => setProduct(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Target Audience</Label>
              <Input placeholder="e.g. CTOs at Series A startups" value={audience} onChange={(e) => setAudience(e.target.value)} />
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
                  <SelectItem value="Drive to website">Drive to website</SelectItem>
                  <SelectItem value="Offer a free trial">Offer a free trial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Professional">Professional</SelectItem>
                  <SelectItem value="Casual">Casual</SelectItem>
                  <SelectItem value="Direct">Direct</SelectItem>
                  <SelectItem value="Curious">Curious</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Email Length</Label>
              <Select value={length} onValueChange={setLength}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ultra-short (3 sentences)">Ultra-short (3 sentences)</SelectItem>
                  <SelectItem value="Short (1 paragraph)">Short (1 paragraph)</SelectItem>
                  <SelectItem value="Medium (2 paragraphs)">Medium (2 paragraphs)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={generate} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PenLine className="h-4 w-4 mr-2" />}
            Generate 3 Variations
          </Button>
        </CardContent>
      </Card>

      {variations.length > 0 && (
        <div className="grid md:grid-cols-3 gap-4">
          {variations.map((v, i) => (
            <Card key={i} className="bg-card border-border">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-sm text-primary">Variation {i + 1}</CardTitle>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(`Subject: ${v.subject}\n\n${v.body}`)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Subject Line</Label>
                  <p className="text-sm font-medium mt-1">{v.subject}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Body</Label>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{v.body}</p>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>{v.body.length} chars</span>
                  <span>{wordCount(v.body)} words</span>
                  <span>~{readTime(v.body)} min read</span>
                </div>

                {v.followUp && (
                  <div className="border-t border-border pt-3 mt-3 space-y-2">
                    <Label className="text-xs text-primary">Follow-up</Label>
                    <p className="text-sm font-medium">{v.followUp.subject}</p>
                    <p className="text-sm whitespace-pre-wrap">{v.followUp.body}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => generateFollowUp(i)} disabled={followUpLoading === i}>
                    {followUpLoading === i ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ArrowRight className="h-3 w-3 mr-1" />}
                    Follow-up
                  </Button>
                  <Button size="sm" onClick={() => saveToCampaign(v)}>
                    Save to Campaign
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, Loader2, Sparkles, Smartphone, Clock, Copy, TrendingUp, AlertTriangle, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface SubjectAnalysis {
  subject: string;
  spam_score: number;
  spam_words: Array<{ word: string; explanation?: string }>;
  predicted_open_rate: string;
  open_rate_reasoning: string;
  preview_text_suggestion: string;
  improved_versions: Array<{ subject: string; explanation: string }>;
  mobile_preview: string;
}

interface MultiAnalysis {
  analyses: SubjectAnalysis[];
  ranking?: Array<{ subject: string; rank: number; reasoning: string }>;
  ab_recommendation?: { subject_a: string; subject_b: string; reasoning: string };
}

export default function SubjectTester() {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [analysis, setAnalysis] = useState<MultiAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("subject_tests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10)
      .then(({ data }) => { if (data) setHistory(data); });
  }, [user]);

  const analyze = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setAnalysis(null);
    try {
      const subjects = input.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 5);
      const { data, error } = await supabase.functions.invoke("generate-email-copy", {
        body: { type: "analyze-subject", subjects: subjects.length === 1 ? subjects[0] : subjects },
      });
      if (error) throw error;
      const content = data?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.analyses) {
          setAnalysis(parsed);
        } else {
          setAnalysis({ analyses: [parsed] });
        }
      }

      // Save to history
      if (user) {
        for (const subj of subjects) {
          await supabase.from("subject_tests").insert({
            user_id: user.id,
            subject_line: subj,
            spam_score: 0,
            predicted_open_rate: "",
            suggestions: null,
          });
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const ringSize = 80;
  const strokeWidth = 6;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const getSpamColor = (score: number) => {
    if (score <= 25) return "hsl(var(--success))";
    if (score <= 50) return "hsl(var(--chart-3))";
    if (score <= 75) return "hsl(var(--warning))";
    return "hsl(var(--destructive))";
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Subject Line Tester</h1>
        <p className="text-muted-foreground text-sm mt-1">AI-powered spam scoring, open rate prediction & improvement suggestions</p>
      </div>

      {/* Input */}
      <Card className="bg-card border-border">
        <CardContent className="pt-6 space-y-4">
          <Textarea
            placeholder={"Enter up to 5 subject lines (one per line) to compare:\n\nQuick question about {{company}}\n3 ways to boost your reply rate\nAre you still using spreadsheets for outreach?"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            className="text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{input.split("\n").filter(s => s.trim()).length}/5 subjects</span>
            <Button onClick={analyze} disabled={loading || !input.trim()} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
              Analyze
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {[0, 1].map(i => (
            <Card key={i} className="bg-card border-border">
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-6 w-48" />
                <div className="flex gap-6">
                  <Skeleton className="h-20 w-20 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Results */}
      {analysis && !loading && (
        <>
          {/* Ranking (multi-subject) */}
          {analysis.ranking && analysis.ranking.length > 1 && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary" />
                  Ranking
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {analysis.ranking.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-md bg-secondary/30 border border-border">
                    <span className={`text-lg font-bold ${i === 0 ? "text-primary" : "text-muted-foreground"}`}>#{r.rank || i + 1}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{r.subject}</p>
                      <p className="text-xs text-muted-foreground">{r.reasoning}</p>
                    </div>
                  </div>
                ))}
                {analysis.ab_recommendation && (
                  <div className="mt-3 p-3 rounded-md bg-primary/10 border border-primary/20">
                    <p className="text-sm font-medium text-primary">A/B Test Recommendation</p>
                    <p className="text-xs text-muted-foreground mt-1">{analysis.ab_recommendation.reasoning}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Per-subject analysis */}
          {analysis.analyses.map((a, idx) => {
            const spamOffset = circumference - ((100 - a.spam_score) / 100) * circumference;
            return (
              <Card key={idx} className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base">{a.subject}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-[auto_1fr] gap-6">
                    {/* Spam Score Ring */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="relative">
                        <svg width={ringSize} height={ringSize} className="transform -rotate-90">
                          <circle cx={ringSize/2} cy={ringSize/2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} />
                          <circle cx={ringSize/2} cy={ringSize/2} r={radius} fill="none" stroke={getSpamColor(a.spam_score)} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={spamOffset} strokeLinecap="round" className="transition-all duration-500" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xl font-bold" style={{ color: getSpamColor(a.spam_score) }}>{100 - a.spam_score}</span>
                          <span className="text-[9px] text-muted-foreground">Safety</span>
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center gap-1 text-sm font-medium">
                          <TrendingUp className="h-3.5 w-3.5 text-primary" />
                          {a.predicted_open_rate}
                        </div>
                        <span className="text-[10px] text-muted-foreground">Predicted Open Rate</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Open Rate Reasoning */}
                      <p className="text-sm text-muted-foreground">{a.open_rate_reasoning}</p>

                      {/* Spam Words */}
                      {a.spam_words && a.spam_words.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">Spam Triggers:</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {a.spam_words.map((w, wi) => (
                              <Badge key={wi} variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30 gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                {typeof w === 'string' ? w : w.word}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Preview Text Suggestion */}
                      <div className="p-3 rounded-md bg-secondary/30 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Suggested Preview Text:</p>
                        <p className="text-sm">{a.preview_text_suggestion}</p>
                      </div>

                      {/* Mobile Preview */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Mobile Preview (40 chars)</span>
                        </div>
                        <div className="bg-secondary/50 border border-border rounded-md p-3">
                          <p className="text-sm font-medium truncate" style={{ maxWidth: "300px" }}>
                            {a.subject.length > 40 ? a.subject.substring(0, 40) + "..." : a.subject}
                          </p>
                          <p className="text-xs text-muted-foreground truncate" style={{ maxWidth: "300px" }}>
                            {a.preview_text_suggestion?.substring(0, 60)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AI Improved Versions */}
                  {a.improved_versions && a.improved_versions.length > 0 && (
                    <div>
                      <p className="text-sm font-medium flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        AI Improvements
                      </p>
                      <div className="space-y-2">
                        {a.improved_versions.map((iv, ivi) => (
                          <div key={ivi} className="flex items-center justify-between p-3 rounded-md bg-secondary/30 border border-border">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{iv.subject}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{iv.explanation}</p>
                            </div>
                            <div className="flex gap-1 ml-3">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(iv.subject); toast.success("Copied!"); }}>
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setInput(iv.subject); toast.success("Applied!"); }}>
                                Use
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}

      {/* History */}
      {history.length > 0 && !loading && !analysis && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Test History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((h: any) => (
              <div key={h.id} className="flex items-center justify-between p-3 rounded-md bg-secondary/30 border border-border cursor-pointer hover:bg-secondary/50 transition-colors"
                onClick={() => { setInput(h.subject_line); toast.success("Loaded!"); }}>
                <p className="text-sm">{h.subject_line}</p>
                <span className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!analysis && !loading && history.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Target className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="font-medium text-lg mb-1">Test your first subject line</p>
            <p className="text-muted-foreground text-sm text-center max-w-md">
              Enter up to 5 subject lines and get AI-powered spam scoring, open rate predictions, 
              mobile preview, and improvement suggestions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Target, Check, X, AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SPAM_WORDS = [
  "free", "guaranteed", "no risk", "limited time", "act now", "click here", "earn money",
  "make money", "winner", "congratulations", "urgent", "100%", "million dollars", "cash",
  "prize", "you've been selected", "dear friend", "increase sales", "double your",
  "extra income", "f r e e", "!!!", "???", "RE:", "FWD:", "buy now", "order now",
  "special offer", "exclusive deal", "don't miss", "once in a lifetime", "risk free",
  "no obligation", "no cost", "no credit card", "satisfaction guaranteed", "money back",
  "lowest price", "bargain", "discount", "save big", "save money", "cheap", "best price",
  "compare rates", "incredible deal", "offer expires", "while supplies last", "apply now",
  "get started now", "subscribe now", "sign up free", "join millions", "be your own boss",
  "work from home", "home based", "online income", "passive income", "financial freedom",
  "get rich", "get paid", "make $", "earn $", "MLM", "multi-level", "direct marketing",
  "eliminate debt", "credit score", "refinance", "mortgage rates", "investment opportunity",
  "stock alert", "forex", "crypto profit", "bitcoin opportunity", "dear valued",
  "as seen on", "miracle", "amazing", "breakthrough", "revolutionary", "secret",
  "unbelievable", "incredible", "shocking", "sensational", "you won", "claim your",
  "verify your account", "confirm your identity", "suspended account", "action required",
  "important notification", "final notice", "last chance",
];

interface CheckResult {
  name: string;
  passed: boolean;
  warn?: boolean;
  detail: string;
}

function analyzeSubject(subject: string): CheckResult[] {
  const checks: CheckResult[] = [];
  const len = subject.length;

  checks.push({
    name: "Length (6–50 chars)",
    passed: len >= 6 && len <= 50,
    detail: `${len} characters`,
  });

  const foundSpam = SPAM_WORDS.filter((w) => subject.toLowerCase().includes(w.toLowerCase()));
  checks.push({
    name: "No spam trigger words",
    passed: foundSpam.length === 0,
    detail: foundSpam.length > 0 ? `Found: ${foundSpam.slice(0, 3).join(", ")}${foundSpam.length > 3 ? "..." : ""}` : "Clean",
  });

  const allCapsWords = subject.split(/\s+/).filter((w) => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
  checks.push({
    name: "No ALL CAPS words",
    passed: allCapsWords.length === 0,
    detail: allCapsWords.length > 0 ? `Found: ${allCapsWords.join(", ")}` : "Clean",
  });

  const exclCount = (subject.match(/!/g) || []).length;
  const questCount = (subject.match(/\?/g) || []).length;
  checks.push({
    name: "No excessive punctuation",
    passed: exclCount <= 1 && questCount <= 1,
    detail: `${exclCount} exclamation, ${questCount} question marks`,
  });

  const hasEmoji = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(subject);
  checks.push({
    name: "No emoji",
    passed: !hasEmoji,
    warn: hasEmoji,
    detail: hasEmoji ? "Some clients may render poorly" : "Clean",
  });

  const hasToken = /\{\{(name|company)\}\}/.test(subject);
  checks.push({
    name: "Personalization token",
    passed: hasToken,
    detail: hasToken ? "Contains personalization" : "Add {{name}} or {{company}}",
  });

  checks.push({
    name: "Question format",
    passed: subject.trim().endsWith("?"),
    detail: subject.trim().endsWith("?") ? "Ends with question" : "Not a question",
  });

  checks.push({
    name: "Contains a number",
    passed: /\d/.test(subject),
    detail: /\d/.test(subject) ? "Has specificity" : "No numbers found",
  });

  return checks;
}

export default function SubjectTester() {
  const [subject, setSubject] = useState("");
  const [debouncedSubject, setDebouncedSubject] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSubject(subject), 300);
    return () => clearTimeout(timer);
  }, [subject]);

  const checks = useMemo(() => {
    if (!debouncedSubject.trim()) return [];
    return analyzeSubject(debouncedSubject);
  }, [debouncedSubject]);

  const score = checks.length > 0 ? Math.round((checks.filter((c) => c.passed).length / checks.length) * 100) : 0;
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : "D";
  const gradeColor = score >= 90 ? "hsl(var(--success))" : score >= 75 ? "hsl(var(--chart-3))" : score >= 60 ? "hsl(var(--warning))" : "hsl(var(--destructive))";

  const ringSize = 120;
  const strokeWidth = 8;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getAiSuggestions = async () => {
    if (!subject.trim()) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-email-copy", {
        body: { type: "subject-rewrite", subject },
      });
      if (error) throw error;
      const content = data?.content || "";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        setSuggestions(JSON.parse(jsonMatch[0]));
      } else {
        setSuggestions([content]);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to get suggestions");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Subject Line Tester</h1>
        <p className="text-muted-foreground text-sm mt-1">Score your subject line for deliverability and engagement</p>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="pt-6">
          <Input
            placeholder="Type your subject line here..."
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="text-lg h-12"
          />
        </CardContent>
      </Card>

      {checks.length > 0 && (
        <div className="grid md:grid-cols-[1fr_200px] gap-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {checks.map((c, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                  {c.passed ? (
                    <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                  ) : c.warn ? (
                    <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  ) : (
                    <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.detail}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-col items-center gap-4">
            <Card className="bg-card border-border p-6 flex flex-col items-center">
              <div className="relative">
                <svg width={ringSize} height={ringSize} className="transform -rotate-90">
                  <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} />
                  <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke={gradeColor} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-500" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold" style={{ color: gradeColor }}>{score}</span>
                  <span className="text-xs text-muted-foreground">Grade {grade}</span>
                </div>
              </div>
            </Card>

            <Button variant="outline" onClick={getAiSuggestions} disabled={aiLoading || !subject.trim()} className="w-full">
              {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              AI Suggestions
            </Button>
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Rewrite Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-md bg-secondary/50 border border-border">
                <span className="text-sm">{s}</span>
                <Button variant="ghost" size="sm" onClick={() => { setSubject(s); toast.success("Applied!"); }}>
                  Use This
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

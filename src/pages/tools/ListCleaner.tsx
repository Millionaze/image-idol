import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Filter, Download, Upload, Shield, Clock, CheckCircle2, XCircle, AlertTriangle, Trash2, FileUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CleaningResult {
  email: string;
  status: "valid" | "risky" | "invalid" | "disposable";
  reason: string;
}

interface CleaningJob {
  id: string;
  filename: string;
  total_emails: number;
  valid_count: number;
  risky_count: number;
  invalid_count: number;
  disposable_count: number;
  status: string;
  created_at: string;
}

const statusConfig: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
  valid: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Valid", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  risky: { icon: <AlertTriangle className="h-3.5 w-3.5" />, label: "Risky", className: "bg-warning/20 text-warning border-warning/30" },
  invalid: { icon: <XCircle className="h-3.5 w-3.5" />, label: "Invalid", className: "bg-destructive/20 text-destructive border-destructive/30" },
  disposable: { icon: <Trash2 className="h-3.5 w-3.5" />, label: "Disposable", className: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
};

export default function ListCleaner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [results, setResults] = useState<CleaningResult[]>([]);
  const [jobs, setJobs] = useState<CleaningJob[]>([]);
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [summary, setSummary] = useState<{ total: number; valid: number; risky: number; invalid: number; disposable: number } | null>(null);
  const [downloadFilter, setDownloadFilter] = useState<"all" | "valid" | "valid-risky">("valid");

  useEffect(() => {
    if (!user) return;
    supabase.from("list_cleaning_jobs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10)
      .then(({ data }) => { if (data) setJobs(data as CleaningJob[]); });
  }, [user]);

  const processFile = useCallback(async (file: File) => {
    if (!user) return;
    setProcessing(true);
    setResults([]);
    setSummary(null);

    try {
      const text = await file.text();
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      
      // Extract emails from CSV (first column)
      const emails: string[] = [];
      const isCSV = lines[0]?.includes(",");
      const startLine = isCSV && lines[0]?.toLowerCase().includes("email") ? 1 : 0;
      
      for (let i = startLine; i < lines.length; i++) {
        const parts = lines[i].split(",");
        const email = parts[0]?.trim().replace(/"/g, "");
        if (email && email.includes("@")) {
          emails.push(email);
        }
      }

      if (emails.length === 0) {
        toast.error("No valid emails found in file");
        setProcessing(false);
        return;
      }

      // Create job
      const { data: job, error: jobError } = await supabase.from("list_cleaning_jobs").insert({
        user_id: user.id,
        filename: file.name,
        total_emails: emails.length,
        status: "processing",
      }).select().single();

      if (jobError || !job) throw jobError || new Error("Failed to create job");

      // Deduplicate
      const unique = [...new Set(emails.map(e => e.toLowerCase()))];

      // Call validation edge function
      const { data, error } = await supabase.functions.invoke("validate-email-list", {
        body: { job_id: job.id, emails: unique },
      });

      if (error) throw error;

      setResults(data.results || []);
      setSummary({
        total: data.total,
        valid: data.valid,
        risky: data.risky,
        invalid: data.invalid,
        disposable: data.disposable,
      });

      // Refresh jobs list
      const { data: updatedJobs } = await supabase.from("list_cleaning_jobs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
      if (updatedJobs) setJobs(updatedJobs as CleaningJob[]);

      toast.success(`Validated ${data.total} emails`);
    } catch (e: any) {
      toast.error(e.message || "Validation failed");
    } finally {
      setProcessing(false);
    }
  }, [user]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.name.endsWith(".txt"))) {
      processFile(file);
    } else {
      toast.error("Please upload a CSV or TXT file");
    }
  }, [processFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const downloadCSV = () => {
    let filtered = results;
    if (downloadFilter === "valid") filtered = results.filter(r => r.status === "valid");
    else if (downloadFilter === "valid-risky") filtered = results.filter(r => r.status === "valid" || r.status === "risky");

    const csv = "email,status,reason\n" + filtered.map(r => `"${r.email}","${r.status}","${r.reason}"`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cleaned-list-${downloadFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("List downloaded");
  };

  const deliverabilityScore = summary ? Math.round(((summary.valid + summary.risky * 0.5) / Math.max(summary.total, 1)) * 100) : 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">List Cleaner</h1>
        <p className="text-muted-foreground text-sm mt-1">Multi-layer email validation: syntax, domain, disposable, role-based & more</p>
      </div>

      {/* Upload Zone */}
      <Card className="bg-card border-border">
        <CardContent className="pt-6">
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <input id="file-input" type="file" accept=".csv,.txt" className="hidden" onChange={handleFileInput} />
            <FileUp className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">Drop your CSV file here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Supports CSV and TXT files with one email per line</p>
          </div>
        </CardContent>
      </Card>

      {/* Processing State */}
      {processing && (
        <Card className="bg-card border-border">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-primary animate-pulse" />
              <span className="text-sm font-medium">Validating emails across 4 layers...</span>
            </div>
            <Progress value={45} className="h-2" />
            <p className="text-xs text-muted-foreground">Checking syntax → Domain MX → Disposable domains → Role-based addresses</p>
          </CardContent>
        </Card>
      )}

      {/* Summary Dashboard */}
      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Card className="bg-card border-border p-4 text-center">
              <div className="text-2xl font-bold text-foreground">{summary.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </Card>
            <Card className="bg-card border-border p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">{summary.valid}</div>
              <div className="text-xs text-muted-foreground">✅ Valid</div>
            </Card>
            <Card className="bg-card border-border p-4 text-center">
              <div className="text-2xl font-bold text-warning">{summary.risky}</div>
              <div className="text-xs text-muted-foreground">⚠️ Risky</div>
            </Card>
            <Card className="bg-card border-border p-4 text-center">
              <div className="text-2xl font-bold text-destructive">{summary.invalid}</div>
              <div className="text-xs text-muted-foreground">❌ Invalid</div>
            </Card>
            <Card className="bg-card border-border p-4 text-center">
              <div className="text-2xl font-bold text-purple-400">{summary.disposable}</div>
              <div className="text-xs text-muted-foreground">🗑️ Disposable</div>
            </Card>
            <Card className="bg-card border-border p-4 text-center">
              <div className="text-2xl font-bold text-primary">{deliverabilityScore}%</div>
              <div className="text-xs text-muted-foreground">Deliverability</div>
            </Card>
          </div>

          {/* Results Table */}
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                Results ({results.length} emails)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r, i) => {
                      const config = statusConfig[r.status] || statusConfig.invalid;
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">{r.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`gap-1 ${config.className}`}>
                              {config.icon}
                              {config.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{r.reason}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Download Options */}
          <div className="flex gap-3 flex-wrap">
            <Button onClick={() => { setDownloadFilter("valid"); downloadCSV(); }} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Valid Only ({summary.valid})
            </Button>
            <Button onClick={() => { setDownloadFilter("valid-risky"); downloadCSV(); }} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Valid + Risky ({summary.valid + summary.risky})
            </Button>
            <Button onClick={() => { setDownloadFilter("all"); downloadCSV(); }} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Full Report
            </Button>
            <Button onClick={() => {
              const validEmails = results.filter(r => r.status === "valid");
              navigate("/campaigns", { state: { importedContacts: validEmails.map(r => ({ email: r.email, name: "" })) } });
            }} className="gap-2">
              <Upload className="h-4 w-4" />
              Import Valid to Campaign
            </Button>
          </div>
        </>
      )}

      {/* Job History */}
      {jobs.length > 0 && !processing && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Cleaning History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Valid</TableHead>
                  <TableHead>Risky</TableHead>
                  <TableHead>Invalid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map(j => (
                  <TableRow key={j.id}>
                    <TableCell className="font-mono text-sm">{j.filename}</TableCell>
                    <TableCell>{j.total_emails}</TableCell>
                    <TableCell className="text-emerald-400">{j.valid_count}</TableCell>
                    <TableCell className="text-warning">{j.risky_count}</TableCell>
                    <TableCell className="text-destructive">{j.invalid_count}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={j.status === "completed" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-primary/20 text-primary border-primary/30"}>
                        {j.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(j.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!summary && !processing && jobs.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Shield className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="font-medium text-lg mb-1">Validate your first email list</p>
            <p className="text-muted-foreground text-sm text-center max-w-md">
              Upload a CSV file with email addresses and we'll validate each one through 4 layers: 
              syntax, domain verification, disposable detection, and role-based filtering.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

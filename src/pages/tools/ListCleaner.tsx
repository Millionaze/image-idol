import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Filter, Download, Upload, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface CleanedEmail {
  email: string;
  name: string;
  status: "valid" | "invalid" | "role-based" | "duplicate" | "suspicious-tld" | "free-provider";
  removed: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUSPICIOUS_TLDS = [".xyz", ".top", ".click", ".loan", ".work", ".gq", ".ml", ".cf", ".tk", ".ga"];
const ROLE_PREFIXES = ["info@", "admin@", "noreply@", "no-reply@", "support@", "sales@", "postmaster@", "abuse@", "webmaster@", "contact@", "help@", "billing@", "office@"];
const FREE_PROVIDERS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "mail.com", "protonmail.com", "zoho.com"];

function classifyEmail(email: string, seen: Set<string>): CleanedEmail["status"] {
  const lower = email.toLowerCase().trim();
  if (!EMAIL_REGEX.test(lower)) return "invalid";
  if (seen.has(lower)) return "duplicate";
  if (ROLE_PREFIXES.some((p) => lower.startsWith(p))) return "role-based";
  if (SUSPICIOUS_TLDS.some((t) => lower.endsWith(t))) return "suspicious-tld";
  const domain = lower.split("@")[1];
  if (FREE_PROVIDERS.includes(domain)) return "free-provider";
  return "valid";
}

const statusColors: Record<string, string> = {
  valid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  invalid: "bg-destructive/20 text-destructive border-destructive/30",
  "role-based": "bg-warning/20 text-warning border-warning/30",
  duplicate: "bg-destructive/20 text-destructive border-destructive/30",
  "suspicious-tld": "bg-warning/20 text-warning border-warning/30",
  "free-provider": "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

export default function ListCleaner() {
  const [rawInput, setRawInput] = useState("");
  const [results, setResults] = useState<CleanedEmail[]>([]);
  const [cleaned, setCleaned] = useState(false);
  const navigate = useNavigate();

  const handleClean = () => {
    const lines = rawInput.split("\n").map((l) => l.trim()).filter(Boolean);
    const seen = new Set<string>();
    const parsed: CleanedEmail[] = [];

    for (const line of lines) {
      let email = line;
      let name = "";
      if (line.includes(",")) {
        const parts = line.split(",").map((p) => p.trim());
        email = parts[0];
        name = parts[1] || "";
      }
      const status = classifyEmail(email, seen);
      if (status !== "duplicate") seen.add(email.toLowerCase().trim());
      parsed.push({ email: email.trim(), name, status, removed: status === "duplicate" || status === "invalid" });
    }

    setResults(parsed);
    setCleaned(true);
  };

  const handleRemove = (index: number) => {
    setResults((prev) => prev.map((r, i) => (i === index ? { ...r, removed: true } : r)));
  };

  const summary = useMemo(() => {
    const valid = results.filter((r) => r.status === "valid" && !r.removed).length;
    const freeValid = results.filter((r) => r.status === "free-provider" && !r.removed).length;
    const duplicates = results.filter((r) => r.status === "duplicate").length;
    const roleBased = results.filter((r) => r.status === "role-based" && !r.removed).length;
    const invalid = results.filter((r) => r.status === "invalid").length;
    const suspicious = results.filter((r) => r.status === "suspicious-tld" && !r.removed).length;
    return { valid: valid + freeValid, duplicates, roleBased, invalid, suspicious };
  }, [results]);

  const downloadCSV = () => {
    const validEmails = results.filter((r) => !r.removed && (r.status === "valid" || r.status === "free-provider"));
    const csv = "email,name\n" + validEmails.map((r) => `${r.email},${r.name}`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cleaned-list.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Clean list downloaded");
  };

  const importToCampaign = () => {
    const validEmails = results.filter((r) => !r.removed && (r.status === "valid" || r.status === "free-provider"));
    navigate("/campaigns", { state: { importedContacts: validEmails.map((r) => ({ email: r.email, name: r.name })) } });
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">List Cleaner</h1>
        <p className="text-muted-foreground text-sm mt-1">Validate and clean your email list before sending campaigns</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            Paste Your Emails
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder={"Paste emails one per line, or CSV format: email, name\n\njohn@example.com, John Doe\njane@company.io"}
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            rows={8}
            className="font-mono text-sm"
          />
          <Button onClick={handleClean} disabled={!rawInput.trim()}>
            <Filter className="h-4 w-4 mr-2" />
            Clean List
          </Button>
        </CardContent>
      </Card>

      {cleaned && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="bg-card border-border p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">{summary.valid}</div>
              <div className="text-xs text-muted-foreground">Valid</div>
            </Card>
            <Card className="bg-card border-border p-4 text-center">
              <div className="text-2xl font-bold text-destructive">{summary.duplicates}</div>
              <div className="text-xs text-muted-foreground">Duplicates</div>
            </Card>
            <Card className="bg-card border-border p-4 text-center">
              <div className="text-2xl font-bold text-warning">{summary.roleBased}</div>
              <div className="text-xs text-muted-foreground">Role-based</div>
            </Card>
            <Card className="bg-card border-border p-4 text-center">
              <div className="text-2xl font-bold text-destructive">{summary.invalid}</div>
              <div className="text-xs text-muted-foreground">Invalid</div>
            </Card>
            <Card className="bg-card border-border p-4 text-center">
              <div className="text-2xl font-bold text-warning">{summary.suspicious}</div>
              <div className="text-xs text-muted-foreground">Suspicious TLD</div>
            </Card>
          </div>

          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <div className="max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-16">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.filter((r) => !r.removed).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-sm">{r.email}</TableCell>
                        <TableCell>{r.name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusColors[r.status]}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemove(results.indexOf(r))}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button onClick={downloadCSV} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Download Clean List
            </Button>
            <Button onClick={importToCampaign}>
              <Upload className="h-4 w-4 mr-2" />
              Import to Campaign
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

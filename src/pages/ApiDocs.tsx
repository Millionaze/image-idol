import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy } from "lucide-react";
import { Link } from "react-router-dom";

const BASE = "https://ivyqkprlrosapkmmwkeh.supabase.co/functions/v1/public-api";

const endpoints: { title: string; desc: string; code: string }[] = [
  {
    title: "List email accounts",
    desc: "Returns your connected sending accounts (including warmup status and reputation).",
    code: `curl ${BASE}/v1/accounts \\
  -H "Authorization: Bearer pg_live_..."`,
  },
  {
    title: "Create a campaign",
    desc: "Creates a draft campaign bound to one of your sending accounts. Pass a `sequences` array for multi-step sequences.",
    code: `curl -X POST ${BASE}/v1/campaigns \\
  -H "Authorization: Bearer pg_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Q4 outreach",
    "account_id": "<email_account_id>",
    "subject": "Quick question, {{name}}",
    "body": "<p>Hi {{name}}, ...</p>",
    "daily_limit": 50,
    "sequences": [
      { "step_number": 2, "subject": "Following up", "body": "<p>Bump</p>", "delay_days": 3 }
    ]
  }'`,
  },
  {
    title: "Add contacts to a campaign",
    desc: "Bulk insert up to 1000 contacts per call.",
    code: `curl -X POST ${BASE}/v1/campaigns/<campaign_id>/contacts \\
  -H "Authorization: Bearer pg_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "contacts": [
      { "email": "alice@acme.com", "name": "Alice" },
      { "email": "bob@acme.com",   "name": "Bob"   }
    ]
  }'`,
  },
  {
    title: "Launch a campaign",
    desc: "Flips status from draft → active. Non-sequence campaigns start sending immediately; sequences are picked up by the scheduler.",
    code: `curl -X POST ${BASE}/v1/campaigns/<campaign_id>/launch \\
  -H "Authorization: Bearer pg_live_..."`,
  },
  {
    title: "Send a one-off email",
    desc: "Send a single transactional email from one of your warmed-up accounts.",
    code: `curl -X POST ${BASE}/v1/emails/send \\
  -H "Authorization: Bearer pg_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "account_id": "<email_account_id>",
    "to": "recipient@example.com",
    "subject": "Hello",
    "html": "<p>Hi there!</p>"
  }'`,
  },
];

export default function ApiDocs() {
  const { toast } = useToast();
  const copy = (text: string) => { navigator.clipboard.writeText(text); toast({ title: "Copied" }); };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API Reference</h1>
        <p className="text-muted-foreground mt-1">
          Programmatically create campaigns and send emails using your warmed-up inboxes.{" "}
          <Link to="/settings" className="text-primary underline">Manage API keys</Link>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Authentication</CardTitle>
          <CardDescription>
            All requests require a Bearer token. Create a key in Settings — it's shown once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <code className="block rounded-md bg-muted p-3 text-xs">
            Authorization: Bearer pg_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
          </code>
          <p className="text-xs text-muted-foreground mt-2">
            Base URL: <code className="font-mono">{BASE}</code>
          </p>
        </CardContent>
      </Card>

      {endpoints.map((e) => (
        <Card key={e.title}>
          <CardHeader>
            <CardTitle className="text-base">{e.title}</CardTitle>
            <CardDescription>{e.desc}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap">{e.code}</pre>
              <Button
                size="icon" variant="ghost"
                className="absolute top-2 right-2"
                onClick={() => copy(e.code)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Errors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Errors return JSON with the shape:</p>
          <pre className="rounded-md bg-muted p-3 text-xs">{`{ "error": { "code": "bad_request", "message": "..." } }`}</pre>
          <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
            <li><code>401 unauthorized</code> — missing/invalid/revoked API key</li>
            <li><code>400 bad_request</code> — invalid input</li>
            <li><code>404 not_found</code> — resource not found or not yours</li>
            <li><code>502 send_failed</code> — SMTP send error</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

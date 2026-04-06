import React, { useState, useEffect } from "react";
import {
  Mail,
  Copy,
  Check,
  AlertCircle,
  Info,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const res = await fetch(`${base}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error ?? `Request failed (${res.status})`);
  return data as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Client {
  id: number;
  name: string;
  email: string | null;
}

interface EmailSettings {
  default_client_id: number | null;
  has_secret: boolean;
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="ml-2 inline-flex items-center gap-1 text-xs text-[#266b75] hover:text-[#1f5560] transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ── Step component ────────────────────────────────────────────────────────────

function SetupStep({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-7 h-7 rounded-full bg-[#266b75] text-white text-xs font-bold flex items-center justify-center mt-0.5">
        {num}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 text-sm mb-1">{title}</p>
        <div className="text-[13px] text-slate-600 space-y-1">{children}</div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function EmailTasksPage() {
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [defaultClientId, setDefaultClientId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [showMailgunDetail, setShowMailgunDetail] = useState(false);

  // The deployed webhook URL
  const appOrigin = window.location.origin;
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const secretParam = settings?.has_secret ? "?token=YOUR_EMAIL_INBOUND_SECRET" : "";
  const webhookUrl = `${appOrigin}${base}/api/email/inbound${secretParam}`;

  useEffect(() => {
    Promise.all([
      apiFetch<{ clients: Client[] }>("/api/clients"),
      apiFetch<EmailSettings>("/api/email/inbound/settings"),
    ])
      .then(([cl, st]) => {
        setClients(cl.clients);
        setSettings(st);
        setDefaultClientId(st.default_client_id ?? "");
      })
      .catch(err => console.error(err));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/email/inbound/settings", {
        method: "POST",
        body: JSON.stringify({
          default_client_id: defaultClientId !== "" ? Number(defaultClientId) : null,
        }),
      });
      toast({ title: "Settings saved", description: "Default client updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#266b75]/10 flex items-center justify-center">
          <Mail className="w-5 h-5 text-[#266b75]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Email-to-Task</h1>
          <p className="text-sm text-slate-500">
            Clients email a dedicated address — tasks appear in the Task Manager automatically.
          </p>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-[#266b75]/5 border border-[#266b75]/20 rounded-xl p-4 text-sm text-slate-700 flex gap-3">
        <Info className="w-4 h-4 text-[#266b75] shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-[#266b75] mb-1">How it works</p>
          <p>
            When a client sends an email to your dedicated task address, the subject becomes the task
            title, the email body becomes the description, and the task is automatically assigned to
            you with a <strong>Pending</strong> status. If the sender's email matches a client on
            file, they're linked automatically.
          </p>
        </div>
      </div>

      {/* Webhook URL card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-slate-800 text-sm">Your Webhook URL</h2>
        <p className="text-xs text-slate-500">
          Paste this URL into your email routing service (Mailgun, SendGrid, Postmark, etc.) as the
          forward destination.
        </p>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
          <code className="flex-1 text-xs text-slate-700 break-all font-mono">{webhookUrl}</code>
          <CopyButton text={webhookUrl} />
        </div>

        {!settings?.has_secret && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              No <code className="font-mono bg-amber-100 px-1 rounded">EMAIL_INBOUND_SECRET</code>{" "}
              is set. Anyone who knows this URL can create tasks. Add the secret to your environment
              variables to secure the endpoint.
            </span>
          </div>
        )}
      </div>

      {/* Default client setting */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-slate-800 text-sm">Default Client</h2>
        <p className="text-xs text-slate-500">
          If the sender's email doesn't match any client on file, the task will be assigned to this
          client. Leave unset to use the first client alphabetically.
        </p>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <select
              value={defaultClientId}
              onChange={e => setDefaultClientId(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 bg-white focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] outline-none"
            >
              <option value="">— Use first client (automatic) —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.email ? ` — ${c.email}` : ""}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-[#266b75] hover:bg-[#266b75]/90 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Setup guide */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-slate-800 text-sm">Setup Guide — Mailgun (recommended)</h2>

        <div className="space-y-4">
          <SetupStep num={1} title="Create a Mailgun account">
            <p>
              Go to{" "}
              <a
                href="https://signup.mailgun.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#266b75] hover:underline inline-flex items-center gap-0.5"
              >
                mailgun.com <ExternalLink className="w-3 h-3" />
              </a>{" "}
              and sign up. The free tier allows up to 100 emails/day.
            </p>
          </SetupStep>

          <SetupStep num={2} title="Add and verify your domain">
            <p>
              In Mailgun → Sending → Domains, add your domain (e.g.{" "}
              <code className="bg-slate-100 px-1 rounded">hmvirtualservices.com</code>). Follow the
              DNS instructions to verify it.
            </p>
            <p className="text-slate-400 italic">
              You can also use Mailgun's sandbox domain for testing without DNS setup.
            </p>
          </SetupStep>

          <SetupStep num={3} title="Create an inbound route">
            <p>
              Go to <strong>Receiving → Create Route</strong> and set:
            </p>
            <ul className="list-disc list-inside space-y-1 mt-1">
              <li>
                <strong>Expression type:</strong> Match Recipient
              </li>
              <li>
                <strong>Recipient:</strong>{" "}
                <code className="bg-slate-100 px-1 rounded">tasks@yourdomain.com</code>
              </li>
              <li>
                <strong>Action:</strong> Forward
              </li>
              <li>
                <strong>Forward URL:</strong>{" "}
                <span className="font-mono text-[11px] bg-slate-100 px-1 rounded break-all">
                  {webhookUrl}
                </span>
                <CopyButton text={webhookUrl} />
              </li>
            </ul>
          </SetupStep>

          <SetupStep num={4} title="Add the webhook secret (recommended)">
            <p>
              In your app's environment variables, add:
            </p>
            <code className="block bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono mt-1">
              EMAIL_INBOUND_SECRET = some-long-random-string
            </code>
            <p className="mt-1">
              Then update the Forward URL in Mailgun to include{" "}
              <code className="bg-slate-100 px-1 rounded">?token=your-secret</code>.
            </p>
          </SetupStep>

          <SetupStep num={5} title="Share the email address with your clients">
            <p>
              Tell clients to email{" "}
              <strong>tasks@yourdomain.com</strong> with the task subject as the email subject and
              any details in the body. That's it — the task will appear in the Task Manager within
              seconds.
            </p>
          </SetupStep>
        </div>

        {/* Toggle other services */}
        <button
          onClick={() => setShowMailgunDetail(v => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          {showMailgunDetail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showMailgunDetail ? "Hide" : "Show"} other email services (SendGrid, Postmark, Zoho)
        </button>

        {showMailgunDetail && (
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Other supported services</p>

            <div className="space-y-2 text-[13px] text-slate-600">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="font-semibold text-slate-700 mb-1">SendGrid Inbound Parse</p>
                <p>In SendGrid → Settings → Inbound Parse, add your domain and set the destination URL to the webhook URL above. SendGrid sends <code className="bg-white border border-slate-200 px-1 rounded">from</code>, <code className="bg-white border border-slate-200 px-1 rounded">subject</code>, and <code className="bg-white border border-slate-200 px-1 rounded">text</code> fields — all supported.</p>
              </div>

              <div className="bg-slate-50 rounded-lg p-3">
                <p className="font-semibold text-slate-700 mb-1">Postmark</p>
                <p>In Postmark → Inbound → Inbound Webhook, set the webhook URL above. Postmark sends JSON with <code className="bg-white border border-slate-200 px-1 rounded">From</code>, <code className="bg-white border border-slate-200 px-1 rounded">Subject</code>, and <code className="bg-white border border-slate-200 px-1 rounded">TextBody</code> fields.</p>
              </div>

              <div className="bg-slate-50 rounded-lg p-3">
                <p className="font-semibold text-slate-700 mb-1">Zoho / Gmail / Other IMAP</p>
                <p>Set up an email forwarding rule in your mail client that uses a service like <a href="https://zapier.com" target="_blank" rel="noopener noreferrer" className="text-[#266b75] hover:underline">Zapier</a> or <a href="https://make.com" target="_blank" rel="noopener noreferrer" className="text-[#266b75] hover:underline">Make</a> to POST to the webhook URL. Map the sender, subject, and body fields.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Test it */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-slate-800 text-sm">Test the Webhook</h2>
        <p className="text-[13px] text-slate-600">
          You can send a test request from your terminal to confirm everything is connected:
        </p>
        <pre className="bg-slate-900 text-slate-100 text-[11px] font-mono rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">{`curl -X POST "${webhookUrl}" \\
  -F "sender=client@example.com" \\
  -F "subject=Please update the Q2 report" \\
  -F "body-plain=Hi, could you update the Q2 report by Friday? Thanks!"`}</pre>
        <p className="text-xs text-slate-400">
          A task should appear in Task Manager within a few seconds.
        </p>
      </div>
    </div>
  );
}

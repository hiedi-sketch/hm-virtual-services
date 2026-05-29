import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, BookOpen, AlertCircle, ChevronDown, ChevronUp,
  ArrowUpDown, ArrowUp, ArrowDown, Flag, X, Send, MessageSquare,
  Mail, CheckCircle2, CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tx = {
  id: number;
  client_id: number;
  import_id: number;
  date: string | null;
  transaction_type: string | null;
  num: string | null;
  name: string | null;
  memo: string | null;
  account: string | null;
  amount: number | null;
  is_uncategorized: boolean;
  status: string;
  flagged_question: string | null;
  question_sent_at: string | null;
  routed_to_channel: string | null;
  client_response: string | null;
  response_received_at: string | null;
};

type StatusKey = "uncategorized" | "needs_info" | "awaiting_response" | "responded" | "resolved";

const STATUS_CONFIG: Record<StatusKey, { label: string; badge: string; dot: string }> = {
  uncategorized:     { label: "Uncategorized",    badge: "bg-red-50 text-red-700 border-red-200",             dot: "bg-red-500" },
  needs_info:        { label: "Needs Info",        badge: "bg-amber-50 text-amber-700 border-amber-200",       dot: "bg-amber-500" },
  awaiting_response: { label: "Awaiting Response", badge: "bg-blue-50 text-blue-700 border-blue-200",          dot: "bg-blue-500" },
  responded:         { label: "Responded",         badge: "bg-purple-50 text-purple-700 border-purple-200",    dot: "bg-purple-500" },
  resolved:          { label: "Resolved",          badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
};

const CHANNEL_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  asana: "Asana",
  clickup: "ClickUp",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10); }
function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function fmtDateShort(d: string | null | undefined) {
  if (!d) return "—";
  try {
    const p = new Date(d.includes("T") ? d : d + "T00:00:00");
    return p.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return d; }
}
function fmtSyncTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch { return iso; }
}
function fmtAmount(amount: number | null | undefined): string {
  if (amount == null) return "—";
  const neg = amount < 0;
  return neg ? `-$${Math.abs(amount).toFixed(2)}` : `$${amount.toFixed(2)}`;
}

function AmountCell({ amount }: { amount: number | null | undefined }) {
  if (amount == null) return <span className="text-slate-300">—</span>;
  const neg = amount < 0;
  return (
    <span className={cn("font-mono text-sm font-semibold tabular-nums", neg ? "text-red-600" : "text-emerald-700")}>
      {fmtAmount(amount)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as StatusKey] ?? STATUS_CONFIG.uncategorized;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap", cfg.badge)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

// ─── Flag Modal ───────────────────────────────────────────────────────────────

function FlagModal({ tx, onClose, onSave }: {
  tx: Tx; onClose: () => void; onSave: (question: string) => Promise<void>;
}) {
  const [question, setQuestion] = useState(tx.flagged_question ?? "");
  const [saving, setSaving] = useState(false);
  const alreadySent = tx.status === "awaiting_response" || tx.status === "responded" || tx.status === "resolved";

  const handleSave = async () => {
    if (!question.trim()) return;
    setSaving(true);
    try { await onSave(question.trim()); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-slate-900">Flag for Client</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{tx.name || "Unknown Payee"}</p>
              <p className="text-xs text-slate-500">{fmtDateShort(tx.date)} · {tx.transaction_type || "—"}</p>
            </div>
            <AmountCell amount={tx.amount} />
          </div>
          {tx.account && <p className="text-xs text-slate-500"><span className="font-medium">Category:</span> {tx.account}</p>}
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Question for Client</label>
            {alreadySent ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                {tx.flagged_question || <span className="text-slate-400 italic">No question recorded</span>}
              </div>
            ) : (
              <textarea
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 resize-none"
                rows={4} value={question} onChange={e => setQuestion(e.target.value)}
                placeholder="What would you like to ask the client about this transaction?" autoFocus
              />
            )}
          </div>
          {alreadySent && tx.question_sent_at && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <p className="text-xs text-blue-700">
                Sent {fmtSyncTime(tx.question_sent_at)} via <span className="font-semibold">{CHANNEL_LABELS[tx.routed_to_channel ?? ""] ?? "Dashboard"}</span>
              </p>
            </div>
          )}
          {/* Show client response if responded */}
          {tx.status === "responded" && tx.client_response && (
            <div className="rounded-xl border border-purple-100 bg-purple-50 px-4 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-purple-700">Client Response</p>
              <p className="text-sm text-purple-900">{tx.client_response}</p>
              {tx.response_received_at && (
                <p className="text-[10px] text-purple-500">{fmtSyncTime(tx.response_received_at)}</p>
              )}
            </div>
          )}
        </div>
        <div className="px-5 pb-5 flex gap-2">
          {!alreadySent ? (
            <>
              <button
                onClick={handleSave} disabled={!question.trim() || saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-40"
              >
                <Flag className="w-4 h-4" />
                {saving ? "Saving…" : tx.flagged_question ? "Update Question" : "Flag & Add Question"}
              </button>
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            </>
          ) : (
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">Close</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Send Summary Panel ───────────────────────────────────────────────────────

function SendPanel({ client, flaggedTxs, onClose, onSend }: {
  client: any; flaggedTxs: Tx[]; onClose: () => void;
  onSend: (note: string) => Promise<{ emailSent: boolean; emailAddress: string | null }>;
}) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ emailSent: boolean; emailAddress: string | null } | null>(null);
  const clientName = client.contact_name || client.name;
  const channel = client.preferred_channel ?? "dashboard";

  const handleSend = async () => {
    setSending(true);
    try {
      const result = await onSend(note.trim());
      setSent(result);
    } finally {
      setSending(false);
    }
  };

  const emailPreview = [
    note.trim() ? `${note.trim()}\n` : null,
    `Hi ${clientName.split(" ")[0]},`,
    "",
    `We have ${flaggedTxs.length} transaction${flaggedTxs.length === 1 ? "" : "s"} that need your attention.`,
    "",
    ...flaggedTxs.map((tx, i) =>
      `${i + 1}. ${tx.name || "Unknown"} — ${fmtAmount(tx.amount)} on ${fmtDateShort(tx.date)}`
    ),
    "",
    "[ Review Transactions → ]",
    "",
    "Thank you,",
    "Hiedi — HM Virtual Services",
  ].filter(l => l !== null).join("\n");

  if (sent) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
        <div className="bg-white w-full sm:rounded-2xl sm:shadow-xl sm:max-w-md p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">Sent successfully</h3>
          <p className="text-slate-500 text-sm mb-1">
            {flaggedTxs.length} {flaggedTxs.length === 1 ? "transaction" : "transactions"} marked as Awaiting Response.
          </p>
          {sent.emailSent && sent.emailAddress && (
            <p className="text-sm font-medium text-emerald-700 mb-6">
              Email sent to {sent.emailAddress}
            </p>
          )}
          {!sent.emailSent && (
            <p className="text-xs text-slate-400 mb-6">Email delivery not configured — transactions updated.</p>
          )}
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: "#266b75" }}
          >Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full sm:rounded-2xl sm:shadow-xl sm:max-w-2xl max-h-[95dvh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-[#266b75]" />
            <span className="font-bold text-slate-900">Send to Client</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-sm font-medium text-amber-800">
              You are about to send{" "}
              <span className="font-bold">{flaggedTxs.length} flagged {flaggedTxs.length === 1 ? "transaction" : "transactions"}</span>{" "}
              to <span className="font-bold">{clientName}</span>.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Delivery:</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#266b75]/10 text-[#266b75] text-xs font-semibold border border-[#266b75]/20">
              <Mail className="w-3 h-3" /> Email to {client.email || "client"}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold border border-slate-200">
              {CHANNEL_LABELS[channel] ?? channel}
            </span>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Flagged Transactions</p>
            <div className="space-y-2">
              {flaggedTxs.map((tx, i) => (
                <div key={tx.id} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 shrink-0">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate text-sm">{tx.name || "Unknown Payee"}</p>
                        <p className="text-xs text-slate-500">{fmtDateShort(tx.date)}{tx.transaction_type ? ` · ${tx.transaction_type}` : ""}</p>
                      </div>
                    </div>
                    <AmountCell amount={tx.amount} />
                  </div>
                  {tx.flagged_question ? (
                    <div className="ml-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800">{tx.flagged_question}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-red-500 pl-5 italic flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> No question added
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              General Note <span className="font-normal text-slate-400 normal-case">(optional — appears at top of email)</span>
            </label>
            <textarea
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 resize-none"
              rows={2} value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Hi! We had a few questions from last month's bookkeeping…"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Email Preview</p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
                <Mail className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500"><span className="font-medium">To:</span> {clientName}{client.email ? ` <${client.email}>` : ""}</span>
              </div>
              <pre className="text-xs text-slate-600 font-sans whitespace-pre-wrap leading-relaxed">{emailPreview}</pre>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button
            onClick={handleSend} disabled={sending}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
            style={{ background: "#266b75" }}
          >
            {sending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send {flaggedTxs.length} {flaggedTxs.length === 1 ? "Transaction" : "Transactions"} to Client</>}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

type SortField = "date" | "name" | "amount" | "account" | "status";
type SortDir = "asc" | "desc";

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />;
  return sortDir === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-[#266b75]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#266b75]" />;
}

function ThBtn({ field, label, sortField, sortDir, onToggle }: {
  field: SortField; label: string;
  sortField: SortField; sortDir: SortDir;
  onToggle: (field: SortField) => void;
}) {
  return (
    <button onClick={() => onToggle(field)} className="inline-flex items-center gap-1 hover:text-slate-700 transition-colors">
      {label}<SortIcon field={field} sortField={sortField} sortDir={sortDir} />
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ClientTransactionsSection({ client }: { client: any }) {
  const { toast } = useToast();

  const realmIds: string[] = (() => {
    if (client?.qbo_realm_ids) { try { return JSON.parse(client.qbo_realm_ids); } catch {} }
    if (client?.qbo_realm_id) return [client.qbo_realm_id];
    return [];
  })();
  const hasQbo = realmIds.length > 0;

  const [startDate, setStartDate] = useState(firstOfMonthStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showAll, setShowAll] = useState(false);
  const [flaggingTx, setFlaggingTx] = useState<Tx | null>(null);
  const [sendPanelOpen, setSendPanelOpen] = useState(false);

  const loadTransactions = useCallback(async () => {
    if (!hasQbo) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/qbo/clients/${client.id}/transactions`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setTransactions(data.transactions ?? []);
      setLastSync(data.lastSync ?? null);
    } catch {} finally { setLoading(false); }
  }, [client.id, hasQbo]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const handleSync = async () => {
    if (!startDate || !endDate) { toast({ title: "Please select a date range", variant: "destructive" }); return; }
    setSyncing(true);
    try {
      const res = await fetch(`/api/qbo/clients/${client.id}/sync-transactions`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      toast({ title: `Synced ${data.synced} transactions from QuickBooks` });
      await loadTransactions();
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally { setSyncing(false); }
  };

  const handleFlagSave = async (question: string) => {
    if (!flaggingTx) return;
    const res = await fetch(`/api/transactions/${flaggingTx.id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagged_question: question, status: "needs_info" }),
    });
    if (!res.ok) { toast({ title: "Failed to flag transaction", variant: "destructive" }); return; }
    const updated = await res.json();
    setTransactions(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
    setFlaggingTx(null);
    toast({ title: "Transaction flagged" });
  };

  const handleMarkResolved = async (txId: number) => {
    const res = await fetch(`/api/transactions/${txId}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolve: true }),
    });
    if (!res.ok) { toast({ title: "Failed to resolve", variant: "destructive" }); return; }
    const updated = await res.json();
    setTransactions(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
    toast({ title: "Marked as resolved" });
  };

  const handleSend = async (note: string): Promise<{ emailSent: boolean; emailAddress: string | null }> => {
    const flagged = transactions.filter(t => t.status === "needs_info");
    if (flagged.length === 0) return { emailSent: false, emailAddress: null };

    const res = await fetch("/api/transactions/batch-send", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: client.id, transaction_ids: flagged.map(t => t.id), note }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Send failed");

    setTransactions(prev =>
      prev.map(t => {
        const upd = (data.updated as Tx[]).find(u => u.id === t.id);
        return upd ? { ...t, ...upd } : t;
      })
    );

    return { emailSent: data.emailSent ?? false, emailAddress: data.emailAddress ?? null };
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) { setSortDir(d => d === "asc" ? "desc" : "asc"); }
    else { setSortField(field); setSortDir(field === "amount" ? "desc" : "asc"); }
  };

  const sorted = [...transactions].sort((a, b) => {
    let av: any, bv: any;
    if (sortField === "date")    { av = a.date ?? ""; bv = b.date ?? ""; }
    if (sortField === "name")    { av = a.name ?? ""; bv = b.name ?? ""; }
    if (sortField === "amount")  { av = a.amount ?? 0; bv = b.amount ?? 0; }
    if (sortField === "account") { av = a.account ?? ""; bv = b.account ?? ""; }
    if (sortField === "status")  { av = a.status ?? ""; bv = b.status ?? ""; }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const uncategorized = sorted.filter(t => t.is_uncategorized || t.status === "uncategorized");
  const categorized   = sorted.filter(t => !t.is_uncategorized && t.status !== "uncategorized");
  const ordered       = [...uncategorized, ...categorized];
  const needsInfoTxs  = transactions.filter(t => t.status === "needs_info");
  const respondedTxs  = transactions.filter(t => t.status === "responded");

  const PAGE_SIZE = 50;
  const displayed = showAll ? ordered : ordered.slice(0, PAGE_SIZE);
  const thCls = "px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap select-none";

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <BookOpen className="w-5 h-5 text-slate-500" />
        <h2 className="text-lg font-semibold text-slate-900">Transactions</h2>
        {transactions.length > 0 && <span className="text-xs text-slate-400">({transactions.length})</span>}
        {respondedTxs.length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-bold border border-purple-200">
            <CheckCheck className="w-3 h-3" /> {respondedTxs.length} new {respondedTxs.length === 1 ? "response" : "responses"}
          </span>
        )}
        {lastSync && <span className="ml-auto text-xs text-slate-400">Last synced {fmtSyncTime(lastSync)}</span>}
      </div>

      {!hasQbo ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-slate-300 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-600">No QuickBooks account linked for this client.</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Link a QBO company on the <a href="/quickbooks" className="text-[#266b75] underline">QuickBooks settings</a> page.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">From</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">To</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30" />
              </div>
              <div className="ml-auto flex items-center gap-2">
                {needsInfoTxs.length > 0 && (
                  <button
                    onClick={() => setSendPanelOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border-2 border-[#266b75] text-[#266b75] hover:bg-[#266b75]/5 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    Send to Client
                    <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#266b75] text-white text-[11px] font-bold leading-none">{needsInfoTxs.length}</span>
                  </button>
                )}
                <button onClick={handleSync} disabled={syncing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
                  style={{ background: "#266b75" }}>
                  <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
                  {syncing ? "Syncing…" : "Sync from QuickBooks"}
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-400">Loading transactions…</div>
          ) : ordered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
              <BookOpen className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-500">No transactions yet.</p>
              <p className="text-xs text-slate-400 mt-0.5">Select a date range and click Sync from QuickBooks.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {uncategorized.length > 0 && (
                <div className="px-4 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span className="text-xs font-semibold text-red-700">
                    {uncategorized.length} uncategorized {uncategorized.length === 1 ? "transaction" : "transactions"} — review needed
                  </span>
                </div>
              )}
              {needsInfoTxs.length > 0 && (
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                  <Flag className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-xs font-semibold text-amber-700">
                    {needsInfoTxs.length} {needsInfoTxs.length === 1 ? "transaction" : "transactions"} flagged — ready to send
                  </span>
                  <button onClick={() => setSendPanelOpen(true)} className="ml-auto text-xs font-semibold text-amber-700 underline hover:no-underline">Send now →</button>
                </div>
              )}
              {respondedTxs.length > 0 && (
                <div className="px-4 py-2 bg-purple-50 border-b border-purple-100 flex items-center gap-2">
                  <CheckCheck className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  <span className="text-xs font-semibold text-purple-700">
                    {respondedTxs.length} client {respondedTxs.length === 1 ? "response" : "responses"} received — review and resolve
                  </span>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className={thCls}><ThBtn field="date" label="Date" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} /></th>
                      <th className={thCls}><ThBtn field="name" label="Vendor / Name" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} /></th>
                      <th className={thCls}>Type</th>
                      <th className={thCls}><ThBtn field="amount" label="Amount" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} /></th>
                      <th className={thCls}><ThBtn field="account" label="Category" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} /></th>
                      <th className={thCls}>Memo</th>
                      <th className={thCls}><ThBtn field="status" label="Status" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} /></th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayed.map(tx => {
                      const isNeedsInfo  = tx.status === "needs_info";
                      const isResponded  = tx.status === "responded";
                      const isUncatRow   = tx.is_uncategorized || tx.status === "uncategorized";
                      return (
                        <tr key={tx.id} className={cn(
                          "hover:bg-slate-50/50 transition-colors",
                          isUncatRow  && "bg-red-50/40",
                          isNeedsInfo && "bg-amber-50/30",
                          isResponded && "bg-purple-50/20",
                        )}>
                          <td className="px-4 py-2.5 whitespace-nowrap text-slate-600 text-xs">{fmtDateShort(tx.date)}</td>
                          <td className="px-4 py-2.5 max-w-[160px]">
                            <span className="font-medium text-slate-800 truncate block">{tx.name || <span className="text-slate-300">—</span>}</span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{tx.transaction_type || <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap"><AmountCell amount={tx.amount} /></td>
                          <td className="px-4 py-2.5 max-w-[180px]">
                            {tx.account
                              ? <span className="text-xs text-slate-600 truncate block">{tx.account}</span>
                              : <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium"><AlertCircle className="w-3 h-3" /> Uncategorized</span>}
                          </td>
                          <td className="px-4 py-2.5 max-w-[180px]">
                            <span className="text-xs text-slate-400 truncate block">{tx.memo || "—"}</span>
                          </td>
                          <td className="px-4 py-2.5 max-w-[200px]">
                            <div className="flex flex-col gap-1">
                              <StatusBadge status={tx.status} />
                              {isNeedsInfo && tx.flagged_question && (
                                <p className="text-[10px] text-amber-600 italic truncate max-w-[160px]">"{tx.flagged_question}"</p>
                              )}
                              {isResponded && tx.client_response && (
                                <p className="text-[10px] text-purple-700 font-medium truncate max-w-[160px]">↩ {tx.client_response}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            {isResponded ? (
                              <div className="flex items-center gap-1.5 justify-end">
                                <button
                                  onClick={() => setFlaggingTx(tx)}
                                  className="text-xs font-medium px-2 py-1 rounded-lg text-purple-600 hover:bg-purple-50 transition-colors"
                                >View</button>
                                <button
                                  onClick={() => handleMarkResolved(tx.id)}
                                  className="text-xs font-medium px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors flex items-center gap-1"
                                >
                                  <CheckCheck className="w-3 h-3" /> Resolve
                                </button>
                              </div>
                            ) : tx.status !== "awaiting_response" && tx.status !== "resolved" ? (
                              <button
                                onClick={() => setFlaggingTx(tx)}
                                className={cn(
                                  "inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-colors",
                                  isNeedsInfo ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                                )}
                              >
                                <Flag className="w-3 h-3" />{isNeedsInfo ? "Edit" : "Flag"}
                              </button>
                            ) : tx.status === "awaiting_response" ? (
                              <button onClick={() => setFlaggingTx(tx)} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors">
                                <CheckCircle2 className="w-3 h-3" /> View
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {ordered.length > PAGE_SIZE && (
                <div className="px-4 py-3 border-t border-slate-100 text-center">
                  <button onClick={() => setShowAll(v => !v)} className="inline-flex items-center gap-1.5 text-xs font-medium text-[#266b75] hover:underline">
                    {showAll ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</> : <><ChevronDown className="w-3.5 h-3.5" /> Show all {ordered.length} transactions</>}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {flaggingTx && <FlagModal tx={flaggingTx} onClose={() => setFlaggingTx(null)} onSave={handleFlagSave} />}
      {sendPanelOpen && (
        <SendPanel
          client={client} flaggedTxs={needsInfoTxs}
          onClose={() => setSendPanelOpen(false)} onSend={handleSend}
        />
      )}
    </div>
  );
}

import { useState, useCallback, useEffect, useRef } from "react";
import { useListClients } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Trash2, AlertTriangle, CheckCircle2, ChevronDown,
  Clock, Calendar, AlertCircle, X, Flag,
  MessageSquare, CheckCheck, StickyNote, Filter, ChevronRight,
  Upload, FileSpreadsheet, CloudUpload, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type TxImport = {
  id: number; client_id: number; filename: string;
  date_range_start: string | null; date_range_end: string | null;
  imported_at: string; row_count: number; source?: string | null;
};

type Tx = {
  id: number; client_id: number; import_id: number;
  date: string | null; transaction_type: string | null; num: string | null;
  name: string | null; memo: string | null; account: string | null;
  category: string | null;
  amount: number | null; is_uncategorized: boolean;
  status: string;
  flagged_question: string | null;
  question_sent_at: string | null;
  routed_to_channel: string | null;
  client_response: string | null;
  client_comment: string | null;
  receipt_url: string | null;
  response_received_at: string | null;
  internal_notes: string | null;
  resolved_at: string | null;
  qbo_txn_id: string | null;
  qbo_txn_type: string | null;
  qbo_account_id: string | null;
  qbo_last_synced_at: string | null;
  qbo_pending: boolean;
};

type TxData = { imports: TxImport[]; transactions: Tx[] };

type QboAccount = {
  Id: string;
  Name: string;
  FullyQualifiedName: string;
  AccountType: string;
  AccountSubType?: string;
};

// ─── Status config ────────────────────────────────────────────────────────────

type StatusKey = "uncategorized" | "needs_info" | "awaiting_response" | "responded" | "resolved";

const STATUS_CONFIG: Record<StatusKey, { label: string; badge: string; dot: string }> = {
  uncategorized:     { label: "Uncategorized",     badge: "bg-red-50 text-red-700 border-red-200",       dot: "bg-red-500" },
  needs_info:        { label: "Needs Info",         badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  awaiting_response: { label: "Awaiting Response",  badge: "bg-blue-50 text-blue-700 border-blue-200",    dot: "bg-blue-500" },
  responded:         { label: "Responded",          badge: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  resolved:          { label: "Resolved",           badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
};

const STATUS_ORDER: StatusKey[] = ["uncategorized", "needs_info", "awaiting_response", "responded", "resolved"];

const CHANNEL_LABELS: Record<string, string> = {
  dashboard: "Dashboard", asana: "Asana", clickup: "ClickUp",
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

// ─── Utilities ────────────────────────────────────────────────────────────────

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? "Request failed"), { status: res.status, body: json });
  return json;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch { return iso; }
}

function fmtDateShort(d: string | null | undefined) {
  if (!d) return "—";
  try {
    const p = /^\d{2}\/\d{2}\/\d{4}$/.test(d)
      ? new Date(d.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$1-$2") + "T00:00:00")
      : new Date(d.includes("T") ? d : d + "T00:00:00");
    return p.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return d; }
}

function AmountCell({ amount }: { amount: number | null | undefined }) {
  if (amount == null) return <span className="text-slate-300">—</span>;
  const neg = amount < 0;
  return (
    <span className={cn("font-mono text-sm font-semibold tabular-nums", neg ? "text-red-600" : "text-emerald-700")}>
      {neg ? `-$${Math.abs(amount).toFixed(2)}` : `$${amount.toFixed(2)}`}
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

// ─── Memo Cell ────────────────────────────────────────────────────────────────

function MemoCell({ tx, onSave }: { tx: Tx; onSave: (memo: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(tx.memo ?? "");
  const [saved, setSaved] = useState(tx.memo ?? "");

  useEffect(() => {
    setValue(tx.memo ?? "");
    setSaved(tx.memo ?? "");
  }, [tx.memo]);

  const handleBlur = () => {
    setEditing(false);
    if (value !== saved) {
      setSaved(value);
      onSave(value);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setValue(saved); setEditing(false); } }}
        className="w-full max-w-[200px] text-xs border border-[#266b75]/40 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 bg-white"
        placeholder="Add memo…"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={cn(
        "flex items-start gap-1 text-left text-xs rounded-lg px-2 py-1 transition-colors w-full max-w-[200px] group truncate",
        value ? "text-slate-500 hover:bg-slate-100 hover:text-slate-700" : "text-slate-300 hover:bg-slate-50 italic"
      )}
      title={value || "Click to add memo"}
    >
      <span className="truncate">{value || "Add memo…"}</span>
    </button>
  );
}

// ─── Category Cell (editable dropdown from Chart of Accounts) ─────────────────

function CategoryCell({ tx, accounts, onSave }: {
  tx: Tx;
  accounts: QboAccount[];
  onSave: (accountId: string, accountName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = accounts
    .filter(a => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        a.FullyQualifiedName.toLowerCase().includes(q) ||
        a.Name.toLowerCase().includes(q) ||
        a.AccountType.toLowerCase().includes(q)
      );
    })
    .slice(0, 30);

  // No accounts loaded — show as plain text (CSV or no QBO realm)
  if (accounts.length === 0) {
    return (
      <span className={cn("text-xs", tx.is_uncategorized ? "text-amber-600 font-medium" : "text-slate-600")}>
        {tx.is_uncategorized ? "Uncategorized" : (tx.category || "—")}
      </span>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => { setOpen(o => !o); setSearch(""); }}
        className={cn(
          "flex items-center gap-1 text-xs rounded-lg px-2 py-1 w-full max-w-[200px] transition-colors group text-left",
          tx.is_uncategorized
            ? "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
            : "text-slate-600 hover:bg-slate-100"
        )}
        title="Click to change category"
      >
        {tx.is_uncategorized && <AlertCircle className="w-3 h-3 shrink-0" />}
        <span className="truncate flex-1">{tx.category || "Uncategorized"}</span>
        <ChevronDown className="w-3 h-3 shrink-0 text-slate-400 group-hover:text-slate-600" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 text-sm focus:outline-none bg-transparent"
              placeholder="Search categories…"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-400 text-center">No matching categories</p>
            ) : filtered.map(a => (
              <button
                key={a.Id}
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  onSave(a.Id, a.FullyQualifiedName);
                  setOpen(false);
                  setSearch("");
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0"
              >
                <div className="text-sm text-slate-800 font-medium truncate">{a.FullyQualifiedName}</div>
                <div className="text-xs text-slate-400">{a.AccountType}{a.AccountSubType ? ` · ${a.AccountSubType}` : ""}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Notes Cell ───────────────────────────────────────────────────────────────

function NotesCell({ tx, onSave }: { tx: Tx; onSave: (notes: string) => void }) {
  const [value, setValue] = useState(tx.internal_notes ?? "");
  const [editing, setEditing] = useState(false);
  const [savedValue, setSavedValue] = useState(tx.internal_notes ?? "");

  useEffect(() => {
    setValue(tx.internal_notes ?? "");
    setSavedValue(tx.internal_notes ?? "");
  }, [tx.internal_notes]);

  const handleBlur = () => {
    setEditing(false);
    if (value !== savedValue) {
      setSavedValue(value);
      onSave(value);
    }
  };

  if (editing) {
    return (
      <textarea
        autoFocus
        className="w-full min-w-[160px] text-xs border border-[#266b75]/40 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 resize-none bg-white"
        rows={3}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder="Add internal note…"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={cn(
        "flex items-start gap-1.5 text-left text-xs rounded-lg px-2 py-1.5 transition-colors w-full min-w-[120px] group",
        value ? "text-slate-600 hover:bg-slate-100" : "text-slate-300 hover:bg-slate-50"
      )}
    >
      <StickyNote className="w-3 h-3 shrink-0 mt-0.5 text-slate-300 group-hover:text-slate-400" />
      <span className={cn("line-clamp-2", !value && "italic")}>
        {value || "Add note…"}
      </span>
    </button>
  );
}

// ─── Flag Side Panel ──────────────────────────────────────────────────────────

function FlagPanel({
  tx, clientChannel, onClose, onSend, onSetNeedsInfo,
}: {
  tx: Tx;
  clientChannel: string;
  onClose: () => void;
  onSend: (question: string) => Promise<void>;
  onSetNeedsInfo: () => void;
}) {
  const [question, setQuestion] = useState(tx.flagged_question ?? "");
  const [sending, setSending] = useState(false);
  const isAlreadySent = tx.status === "awaiting_response" || tx.status === "responded" || tx.status === "resolved";

  const handleSend = async () => {
    if (!question.trim()) return;
    setSending(true);
    try { await onSend(question.trim()); }
    finally { setSending(false); }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-slate-900">Flag for Client</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{tx.name || "Unknown Payee"}</p>
              <p className="text-xs text-slate-500 mt-0.5">{fmtDateShort(tx.date)} · {tx.transaction_type || "—"}</p>
            </div>
            <AmountCell amount={tx.amount} />
          </div>
          {tx.account && (
            <p className="text-xs text-slate-500">
              <span className="font-medium text-slate-600">Account:</span> {tx.account}
            </p>
          )}
          {tx.category && (
            <p className="text-xs text-slate-500">
              <span className="font-medium text-slate-600">Category:</span> {tx.category}
            </p>
          )}
          {tx.memo && (
            <p className="text-xs text-slate-500">
              <span className="font-medium text-slate-600">Memo:</span> {tx.memo}
            </p>
          )}
          <div className="pt-1">
            <StatusBadge status={tx.status} />
          </div>
        </div>

        <div className="flex-1 flex flex-col px-5 py-4 gap-3 overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Question for Client
            </label>
            {isAlreadySent ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 whitespace-pre-wrap">
                {tx.flagged_question || <span className="text-slate-400 italic">No question recorded</span>}
              </div>
            ) : (
              <textarea
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] resize-none"
                rows={5}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="What would you like to ask the client about this transaction?"
              />
            )}
          </div>

          {isAlreadySent && tx.question_sent_at && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Sent to Client
              </p>
              <p className="text-xs text-blue-600">
                {fmtDate(tx.question_sent_at)} via{" "}
                <span className="font-semibold">{CHANNEL_LABELS[tx.routed_to_channel ?? ""] ?? tx.routed_to_channel ?? "Dashboard"}</span>
              </p>
            </div>
          )}

          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Delivery Channel</p>
            <p className="text-sm text-slate-700 font-medium">
              {CHANNEL_LABELS[clientChannel] ?? clientChannel ?? "Dashboard"}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Set on client's profile</p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
          {!isAlreadySent ? (
            <>
              <button
                onClick={handleSend}
                disabled={!question.trim() || sending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#266b75] text-white text-sm font-semibold hover:bg-[#1f545d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <MessageSquare className="w-4 h-4" />
                {sending ? "Sending…" : "Send to Client"}
              </button>
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
            </>
          ) : (
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Transaction Edit Panel ───────────────────────────────────────────────────

function TransactionEditPanel({
  tx, accounts, hasQboRealm, isSavingQbo,
  onClose, onSaveMemo, onSaveCategory, onSaveNotes, onSaveToQbo, onFlag, onResolve,
}: {
  tx: Tx;
  accounts: QboAccount[];
  hasQboRealm: boolean;
  isSavingQbo: boolean;
  onClose: () => void;
  onSaveMemo: (memo: string) => void;
  onSaveCategory: (accountId: string, accountName: string) => void;
  onSaveNotes: (notes: string) => void;
  onSaveToQbo: () => void;
  onFlag: () => void;
  onResolve: () => void;
}) {
  const [memo, setMemo] = useState(tx.memo ?? "");
  const [notes, setNotes] = useState(tx.internal_notes ?? "");

  useEffect(() => { setMemo(tx.memo ?? ""); }, [tx.memo]);
  useEffect(() => { setNotes(tx.internal_notes ?? ""); }, [tx.internal_notes]);

  const hasPendingQbo = tx.qbo_pending && !!tx.qbo_txn_id && hasQboRealm;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <span className="font-semibold text-slate-900 text-base">Transaction Details</span>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 text-base truncate">{tx.name || "Unknown Payee"}</p>
              <p className="text-xs text-slate-500 mt-0.5">{fmtDateShort(tx.date)} · {tx.transaction_type || "—"}</p>
            </div>
            <div className="text-right shrink-0">
              {tx.amount != null && tx.amount < 0 && (
                <>
                  <p className="font-mono font-bold text-red-600 text-lg leading-none">${Math.abs(tx.amount).toFixed(2)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Debit</p>
                </>
              )}
              {tx.amount != null && tx.amount > 0 && (
                <>
                  <p className="font-mono font-bold text-emerald-700 text-lg leading-none">${tx.amount.toFixed(2)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Credit</p>
                </>
              )}
              {tx.amount == null && <p className="text-slate-300">—</p>}
            </div>
          </div>
          {tx.account && (
            <p className="text-xs text-slate-500"><span className="font-medium text-slate-600">Account:</span> {tx.account}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={tx.status} />
            {hasPendingQbo && (
              <span className="inline-flex items-center gap-1 text-xs text-[#266b75] font-medium">
                <CloudUpload className="w-3 h-3" /> Unsaved QBO changes
              </span>
            )}
          </div>
        </div>

        {/* Editable fields */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Memo / Description</label>
            <input
              type="text"
              value={memo}
              onChange={e => setMemo(e.target.value)}
              onBlur={() => { if (memo !== (tx.memo ?? "")) onSaveMemo(memo); }}
              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setMemo(tx.memo ?? ""); }}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75]"
              placeholder="Add memo…"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
            <CategoryCell tx={tx} accounts={accounts} onSave={onSaveCategory} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Internal Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={() => { if (notes !== (tx.internal_notes ?? "")) onSaveNotes(notes); }}
              rows={4}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] resize-none"
              placeholder="Add internal note…"
            />
          </div>

          {tx.flagged_question && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Question Sent to Client</label>
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-blue-900 whitespace-pre-wrap">
                {tx.flagged_question}
              </div>
              {tx.question_sent_at && (
                <p className="text-xs text-slate-400 mt-1">
                  {fmtDate(tx.question_sent_at)} · via {CHANNEL_LABELS[tx.routed_to_channel ?? ""] ?? tx.routed_to_channel ?? "Dashboard"}
                </p>
              )}
            </div>
          )}

          {tx.client_response && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Client Response</label>
              <div className="rounded-xl border border-purple-100 bg-purple-50 px-3 py-2.5 text-sm text-purple-900 whitespace-pre-wrap">
                {tx.client_response}
              </div>
              {tx.response_received_at && (
                <p className="text-xs text-slate-400 mt-1">Received {fmtDate(tx.response_received_at)}</p>
              )}
            </div>
          )}

          {tx.client_comment && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Client Comment</label>
              <div className="rounded-xl border border-purple-100 bg-purple-50/60 px-3 py-2.5 text-sm text-purple-900 whitespace-pre-wrap">
                {tx.client_comment}
              </div>
            </div>
          )}

          {tx.receipt_url && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Receipt</label>
              {/\.(jpg|jpeg|png)$/i.test(tx.receipt_url) ? (
                <a href={tx.receipt_url} target="_blank" rel="noopener noreferrer" className="block">
                  <img
                    src={tx.receipt_url}
                    alt="Receipt"
                    className="rounded-xl border border-slate-200 max-w-full object-contain max-h-48 hover:opacity-90 transition-opacity"
                  />
                  <p className="text-xs text-[#266b75] mt-1 hover:underline">View full image →</p>
                </a>
              ) : (
                <a
                  href={tx.receipt_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 font-medium hover:bg-slate-100 transition-colors"
                >
                  <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
                  View Receipt (PDF)
                </a>
              )}
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-slate-100 space-y-2">
          {hasPendingQbo && (
            <button
              onClick={onSaveToQbo}
              disabled={isSavingQbo}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#266b75] text-white text-sm font-semibold hover:bg-[#1f545d] transition-colors disabled:opacity-50"
            >
              <CloudUpload className={cn("w-4 h-4", isSavingQbo && "animate-pulse")} />
              {isSavingQbo ? "Saving to QuickBooks…" : "Save Changes to QuickBooks"}
            </button>
          )}
          <div className="flex gap-2">
            {tx.status !== "resolved" && (
              <button
                onClick={onFlag}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-amber-200 bg-amber-50/50 text-amber-700 text-sm font-semibold hover:bg-amber-50 transition-colors"
              >
                <Flag className="w-4 h-4" />
                {tx.status === "awaiting_response" || tx.status === "responded" ? "View Question" : "Flag for Client"}
              </button>
            )}
            {tx.status === "responded" && (
              <button
                onClick={onResolve}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 text-emerald-700 text-sm font-semibold hover:bg-emerald-50 transition-colors"
              >
                <CheckCheck className="w-4 h-4" />
                Mark Resolved
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const { data: clients } = useListClients();
  const { toast } = useToast();

  const [selectedClientId, setSelectedClientId] = useState<number | "">("");

  const [txData, setTxData] = useState<TxData | null>(null);
  const [txMap, setTxMap] = useState<Map<number, Tx>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadConflict, setUploadConflict] = useState<{ existing: TxImport; message: string; file: File } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [flagTxId, setFlagTxId] = useState<number | null>(null);
  const [editTxId, setEditTxId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [qboAccounts, setQboAccounts] = useState<QboAccount[]>([]);
  const [savingQbo, setSavingQbo] = useState<Set<number>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);

  const activeClientIdRef = useRef<number | "">(selectedClientId);

  const activeClients = (clients ?? []).filter(c => (c as any).is_active !== false);
  const selectedClient = activeClients.find(c => c.id === selectedClientId);
  const clientChannel = (selectedClient as any)?.preferred_channel ?? "dashboard";
  const hasQboRealm = !!(selectedClient as any)?.qbo_realm_id;

  const allTx: Tx[] = (txData?.transactions ?? []).map(t => txMap.get(t.id) ?? t);
  const editTx = editTxId != null ? (txMap.get(editTxId) ?? allTx.find(t => t.id === editTxId) ?? null) : null;

  const loadTransactions = useCallback(async (clientId: number) => {
    if (activeClientIdRef.current !== clientId) return; // stale caller — a newer client was already selected
    setLoading(true);
    setLoadError(null);
    setTxData(null);
    setTxMap(new Map());
    try {
      const data = await apiFetch(`/api/transactions?client_id=${clientId}`);
      if (activeClientIdRef.current !== clientId) return; // stale — a newer client was selected
      const normalized: TxData = {
        imports: Array.isArray(data?.imports) ? data.imports : [],
        transactions: Array.isArray(data?.transactions) ? data.transactions : [],
      };
      setTxData(normalized);
      const m = new Map<number, Tx>();
      normalized.transactions.forEach(t => m.set(t.id, t));
      setTxMap(m);
    } catch (err: any) {
      if (activeClientIdRef.current !== clientId) return;
      setLoadError(err.message ?? "Failed to load transactions");
      toast({ title: "Failed to load transactions", description: err.message, variant: "destructive" });
    } finally {
      if (activeClientIdRef.current === clientId) setLoading(false);
    }
  }, [toast]);

  const loadQboAccounts = useCallback(async (clientId: number) => {
    try {
      const data = await apiFetch(`/api/qbo/clients/${clientId}/accounts`);
      setQboAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
    } catch {
      setQboAccounts([]);
    }
  }, []);

  useEffect(() => {
    if (selectedClientId) {
      activeClientIdRef.current = selectedClientId; // authoritative update for programmatic changes
      setTxData(null);
      setTxMap(new Map());
      setUploadConflict(null);
      setEditTxId(null);
      setFlagTxId(null);
      setFilterStatus("all");
      setQboAccounts([]);
      loadTransactions(selectedClientId as number);
    } else {
      activeClientIdRef.current = "";
      setTxData(null);
      setTxMap(new Map());
      setLoadError(null);
      setUploadConflict(null);
      setEditTxId(null);
      setFlagTxId(null);
      setQboAccounts([]);
    }
  }, [selectedClientId, loadTransactions]);

  useEffect(() => {
    if (selectedClientId && hasQboRealm) {
      loadQboAccounts(selectedClientId as number);
    }
  }, [selectedClientId, hasQboRealm, loadQboAccounts]);

  const patchTx = useCallback((id: number, updates: Partial<Tx>) => {
    setTxMap(prev => {
      const m = new Map(prev);
      const cur = m.get(id);
      if (cur) m.set(id, { ...cur, ...updates });
      return m;
    });
  }, []);

  const apiPatch = useCallback(async (id: number, body: Record<string, any>, optimistic?: Partial<Tx>) => {
    if (optimistic) patchTx(id, optimistic);
    try {
      const updated: Tx = await apiFetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      patchTx(id, updated);
      return updated;
    } catch (err: any) {
      if (optimistic && txData) {
        const original = txData.transactions.find(t => t.id === id);
        if (original) patchTx(id, original);
      }
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
      throw err;
    }
  }, [patchTx, txData, toast]);

  const doUpload = async (file: File, overwrite = false) => {
    if (!selectedClientId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("client_id", String(selectedClientId));
      if (overwrite) fd.append("overwrite", "true");
      const result = await apiFetch("/api/transactions/upload", { method: "POST", body: fd });
      setUploadConflict(null);
      toast({
        title: "Upload complete",
        description: `${result.count} transaction${result.count === 1 ? "" : "s"} imported.`,
      });
      await loadTransactions(selectedClientId as number);
    } catch (err: any) {
      if (err.status === 409 && err.body?.conflict) {
        setUploadConflict({ existing: err.body.existing_import, message: err.body.message, file });
      } else {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFlag = async (tx: Tx) => {
    if (tx.status === "uncategorized") {
      await apiPatch(tx.id, { status: "needs_info" }, { status: "needs_info" });
    }
    setFlagTxId(tx.id);
  };

  const handleSendQuestion = async (txId: number, question: string) => {
    await apiPatch(txId, { send_question: true, flagged_question: question }, {
      status: "awaiting_response",
      flagged_question: question,
      question_sent_at: new Date().toISOString(),
    });
    toast({ title: "Question recorded", description: "Status updated to Awaiting Response." });
    setFlagTxId(null);
  };

  const handleResolve = async (tx: Tx) => {
    await apiPatch(tx.id, { resolve: true }, { status: "resolved", resolved_at: new Date().toISOString() });
    toast({ title: "Marked as Resolved" });
  };

  const handleSaveNotes = async (txId: number, notes: string) => {
    await apiPatch(txId, { internal_notes: notes }, { internal_notes: notes });
  };

  const handleSaveMemo = async (txId: number, memo: string) => {
    await apiPatch(txId, { memo }, { memo, qbo_pending: true });
  };

  const handleSaveCategory = async (txId: number, accountId: string, accountName: string) => {
    await apiPatch(txId, { category: accountName, qbo_account_id: accountId }, {
      category: accountName,
      qbo_account_id: accountId,
      is_uncategorized: false,
      qbo_pending: true,
    });
  };

  const handleSaveToQbo = async (txId: number) => {
    setSavingQbo(prev => new Set(prev).add(txId));
    try {
      const result = await apiFetch(`/api/qbo/transactions/${txId}/save`, { method: "POST" });
      if (result.transaction) patchTx(txId, result.transaction);
      toast({ title: "Saved to QuickBooks", description: "Memo and category updated successfully." });
    } catch (err: any) {
      toast({ title: "QuickBooks save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingQbo(prev => { const s = new Set(prev); s.delete(txId); return s; });
    }
  };

  const handleBulkSaveToQbo = async () => {
    if (!selectedClientId) return;
    setBulkSaving(true);
    try {
      const result = await apiFetch("/api/qbo/transactions/bulk-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: selectedClientId }),
      });
      // Refresh tx data to reflect cleared qbo_pending flags
      await loadTransactions(selectedClientId as number);
      const { succeeded, failed, total } = result;
      if (failed === 0) {
        toast({ title: `Saved ${succeeded} transaction${succeeded !== 1 ? "s" : ""} to QuickBooks` });
      } else {
        toast({
          title: `Partial save: ${succeeded} of ${total} succeeded`,
          description: `${failed} transaction${failed !== 1 ? "s" : ""} could not be updated in QuickBooks.`,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: "Bulk save failed", description: err.message, variant: "destructive" });
    } finally {
      setBulkSaving(false);
    }
  };

  const handleDeleteImport = async (importId: number) => {
    try {
      await apiFetch(`/api/transactions/import/${importId}`, { method: "DELETE" });
      toast({ title: "Sync record deleted" });
      if (selectedClientId) await loadTransactions(selectedClientId as number);
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const uncategorized = allTx.filter(t => t.is_uncategorized);
  const categorized = allTx.filter(t => !t.is_uncategorized);
  const sorted = [...uncategorized, ...categorized];
  const filtered = filterStatus === "all" ? sorted : sorted.filter(t => t.status === filterStatus);

  const flagTx = flagTxId != null ? (txMap.get(flagTxId) ?? null) : null;

  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = allTx.filter(t => t.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const netTotal = filtered.reduce((s, t) => s + (t.amount ?? 0), 0);

  const pendingQboCount = allTx.filter(t => t.qbo_pending && t.qbo_txn_id).length;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Transactions</h1>
        <p className="text-slate-500 mt-1">Upload and review transactions per client.</p>
      </div>

      {/* ── Controls bar ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">

          {/* Client selector */}
          <div className="relative flex-1 max-w-xs">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Client</label>
            <div className="relative">
              <select
                value={selectedClientId}
                onChange={e => {
                  const newId = e.target.value ? Number(e.target.value) : "";
                  activeClientIdRef.current = newId; // set synchronously before any effect fires
                  setSelectedClientId(newId);
                  setTxData(null);
                  setTxMap(new Map());
                  setUploadConflict(null);
                }}
                className="w-full appearance-none border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] pr-8"
              >
                <option value="">— Select a client —</option>
                {activeClients.map(c => (
                  <option key={c.id} value={c.id}>{(c as any).contact_name || c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Upload button */}
          <div className="shrink-0 flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) doUpload(file);
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!selectedClientId || uploading}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors",
                selectedClientId && !uploading
                  ? "bg-[#266b75] text-white hover:bg-[#1f545d]"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              )}
            >
              <Upload className={cn("w-4 h-4", uploading && "animate-pulse")} />
              {uploading ? "Uploading…" : "Upload Spreadsheet"}
            </button>
          </div>
        </div>

        {/* Upload history */}
        {txData && txData.imports.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Upload History</p>
            {txData.imports.map(imp => (
              <div key={imp.id} className="flex items-center justify-between gap-3 text-xs text-slate-600">
                <div className="flex items-center gap-2 min-w-0">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#7dbdc6] shrink-0" />
                  <span className="font-medium text-slate-700 truncate max-w-[180px]" title={imp.filename}>
                    {imp.filename}
                  </span>
                  <span className="text-slate-400 shrink-0">·</span>
                  <span className="shrink-0">{imp.row_count} rows</span>
                  <span className="text-slate-400 shrink-0">·</span>
                  <span className="flex items-center gap-1 text-slate-400 shrink-0">
                    <Clock className="w-3 h-3" /> {fmtDate(imp.imported_at)}
                  </span>
                </div>
                {deleteConfirmId === imp.id ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-red-600 font-medium">Delete?</span>
                    <button onClick={() => handleDeleteImport(imp.id)} className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">Yes</button>
                    <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteConfirmId(imp.id)} className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded shrink-0" title="Delete upload">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Conflict warning ── */}
      {uploadConflict && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-900">Date Range Already Uploaded</p>
            <p className="text-sm text-amber-800 mt-1">{uploadConflict.message}</p>
            <p className="text-xs text-amber-700 mt-1">
              Last uploaded: <span className="font-medium">{fmtDate(uploadConflict.existing.imported_at)}</span> · {uploadConflict.existing.row_count} rows
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => doUpload(uploadConflict.file, true)}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" /> Replace
            </button>
            <button onClick={() => setUploadConflict(null)} className="p-2 rounded-xl text-amber-600 hover:bg-amber-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Empty states ── */}
      {!selectedClientId && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-16 text-center">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">Select a client to view transactions</p>
          <p className="text-slate-400 text-sm mt-1">Then click "Upload Spreadsheet" to import transactions.</p>
        </div>
      )}
      {selectedClientId && loading && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-12 text-center text-slate-400 text-sm">
          Loading transactions…
        </div>
      )}
      {selectedClientId && !loading && loadError && (
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm px-6 py-10 text-center">
          <AlertTriangle className="w-10 h-10 text-red-300 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">Could not load transactions</p>
          <p className="text-slate-400 text-sm mt-1 mb-4">{loadError}</p>
          <button
            onClick={() => loadTransactions(selectedClientId as number)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#266b75] text-white text-sm font-semibold hover:bg-[#1f545d] transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
      {selectedClientId && !loading && !loadError && txData && allTx.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-16 text-center">
          <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">No transactions uploaded yet</p>
          <p className="text-slate-400 text-sm mt-1">Click "Upload Spreadsheet" above to import a CSV or Excel file.</p>
        </div>
      )}

      {/* ── Transaction table ── */}
      {selectedClientId && !loading && allTx.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Filter bar */}
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 overflow-x-auto">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <button
              onClick={() => setFilterStatus("all")}
              className={cn(
                "shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors border",
                filterStatus === "all"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              )}
            >
              All <span className="ml-1 opacity-60">{allTx.length}</span>
            </button>
            {STATUS_ORDER.map(s => {
              const cfg = STATUS_CONFIG[s];
              const cnt = counts[s];
              if (cnt === 0 && filterStatus !== s) return null;
              return (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors border",
                    filterStatus === s ? cfg.badge + " opacity-100" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dot)} />
                  {cfg.label}
                  <span className="opacity-60">{cnt}</span>
                </button>
              );
            })}

            {/* Save All to QBO */}
            {pendingQboCount > 0 && hasQboRealm && (
              <button
                onClick={handleBulkSaveToQbo}
                disabled={bulkSaving}
                className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#266b75] text-white hover:bg-[#1f545d] transition-colors disabled:opacity-60"
                title={`Save ${pendingQboCount} pending change${pendingQboCount !== 1 ? "s" : ""} to QuickBooks`}
              >
                <CloudUpload className={cn("w-3.5 h-3.5", bulkSaving && "animate-pulse")} />
                {bulkSaving ? "Saving…" : `Save All to QuickBooks`}
                <span className="bg-white/20 px-1.5 py-0.5 rounded-full">{pendingQboCount}</span>
              </button>
            )}
          </div>

          {/* Uncategorized notice */}
          {filterStatus === "all" && uncategorized.length > 0 && (
            <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 border-b border-amber-100">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-sm text-amber-800 font-medium">
                {uncategorized.length} transaction{uncategorized.length !== 1 ? "s" : ""} missing Category — shown at top
              </span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                  <th className="px-4 py-3.5 w-28">Date</th>
                  <th className="px-4 py-3.5 w-28">Type</th>
                  <th className="px-4 py-3.5">Vendor / Payee</th>
                  <th className="px-4 py-3.5 w-48">Memo</th>
                  <th className="px-4 py-3.5 w-40">Account</th>
                  <th className="px-4 py-3.5 w-52">Category</th>
                  <th className="px-4 py-3.5 w-36">Status</th>
                  <th className="px-4 py-3.5 w-28 text-right">Debit</th>
                  <th className="px-4 py-3.5 w-28 text-right">Credit</th>
                  <th className="px-4 py-3.5 w-36">Internal Notes</th>
                  <th className="px-4 py-3.5 w-28 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-10 text-center text-slate-400 text-sm">
                      No transactions match this filter.
                    </td>
                  </tr>
                ) : filtered.map(tx => {
                  const isSavingQbo = savingQbo.has(tx.id);
                  const hasPendingQbo = tx.qbo_pending && !!tx.qbo_txn_id && hasQboRealm;
                  return (
                    <tr
                      key={tx.id}
                      onClick={() => setEditTxId(tx.id)}
                      className={cn(
                        "hover:bg-slate-50/80 transition-colors group cursor-pointer",
                        tx.is_uncategorized && filterStatus === "all" && "bg-amber-50/30 hover:bg-amber-50/60"
                      )}
                    >
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                        {fmtDateShort(tx.date)}
                      </td>
                      <td className="px-4 py-3">
                        {tx.transaction_type
                          ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">{tx.transaction_type}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800 max-w-[160px] truncate">
                          {tx.name || <span className="text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-500 truncate block max-w-[200px]" title={tx.memo ?? undefined}>
                          {tx.memo || <span className="text-slate-300 italic">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-600 truncate block max-w-[150px]" title={tx.account ?? undefined}>
                          {tx.account || <span className="text-slate-300">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {tx.is_uncategorized ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                            <AlertCircle className="w-3 h-3 shrink-0" /> Uncategorized
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600 truncate block max-w-[190px]" title={tx.category ?? undefined}>
                            {tx.category || <span className="text-slate-300">—</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={tx.status} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {tx.amount != null && tx.amount < 0
                          ? <span className="font-mono text-sm font-semibold tabular-nums text-red-600">${Math.abs(tx.amount).toFixed(2)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {tx.amount != null && tx.amount > 0
                          ? <span className="font-mono text-sm font-semibold tabular-nums text-emerald-700">${tx.amount.toFixed(2)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {tx.internal_notes
                          ? <span className="inline-flex items-center gap-1 text-xs text-slate-500" title={tx.internal_notes}><StickyNote className="w-3.5 h-3.5 shrink-0 text-slate-400" /><span className="truncate max-w-[90px]">{tx.internal_notes}</span></span>
                          : <StickyNote className="w-3.5 h-3.5 text-slate-200" />}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {/* Save to QBO */}
                          {hasPendingQbo && (
                            <button
                              onClick={() => handleSaveToQbo(tx.id)}
                              disabled={isSavingQbo}
                              title="Save changes to QuickBooks"
                              className={cn(
                                "p-1.5 rounded-lg transition-colors",
                                isSavingQbo
                                  ? "text-slate-400 bg-slate-50 animate-pulse"
                                  : "text-[#266b75] bg-[#266b75]/10 hover:bg-[#266b75]/20"
                              )}
                            >
                              <CloudUpload className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Flag for client */}
                          {tx.status !== "resolved" && (
                            <button
                              onClick={() => handleFlag(tx)}
                              title={tx.status === "awaiting_response" || tx.status === "responded" ? "View question" : "Flag for client"}
                              className={cn(
                                "p-1.5 rounded-lg transition-colors",
                                tx.status === "awaiting_response" || tx.status === "responded"
                                  ? "text-blue-500 bg-blue-50 hover:bg-blue-100"
                                  : tx.status === "needs_info"
                                  ? "text-amber-500 bg-amber-50 hover:bg-amber-100"
                                  : "text-slate-400 hover:text-amber-500 hover:bg-amber-50 opacity-0 group-hover:opacity-100"
                              )}
                            >
                              <Flag className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Resolve */}
                          {tx.status === "responded" && (
                            <button
                              onClick={() => handleResolve(tx)}
                              title="Mark as Resolved"
                              className="p-1.5 rounded-lg text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                            >
                              <CheckCheck className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Resolved indicator */}
                          {tx.status === "resolved" && (
                            <span className="p-1.5 rounded-lg text-emerald-500 bg-emerald-50 cursor-default" title={`Resolved ${tx.resolved_at ? fmtDate(tx.resolved_at) : ""}`}>
                              <CheckCheck className="w-3.5 h-3.5" />
                            </span>
                          )}

                          {/* View sent question */}
                          {(tx.status === "awaiting_response" || tx.status === "responded") && (
                            <button
                              onClick={() => setFlagTxId(tx.id)}
                              title="View sent question"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
            <span>
              {filtered.length} of {allTx.length} transaction{allTx.length !== 1 ? "s" : ""}
              {filterStatus !== "all" && <span className="ml-1 text-slate-400">(filtered)</span>}
              {pendingQboCount > 0 && (
                <span className="ml-2 text-[#266b75] font-medium">
                  · {pendingQboCount} pending QBO save{pendingQboCount !== 1 ? "s" : ""}
                </span>
              )}
            </span>
            <span>
              Net:{" "}
              <span className={cn("font-semibold", netTotal < 0 ? "text-red-600" : "text-emerald-700")}>
                {netTotal < 0 ? `-$${Math.abs(netTotal).toFixed(2)}` : `$${netTotal.toFixed(2)}`}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* ── Flag Side Panel ── */}
      {flagTx && (
        <FlagPanel
          tx={flagTx}
          clientChannel={clientChannel}
          onClose={() => setFlagTxId(null)}
          onSend={question => handleSendQuestion(flagTx.id, question)}
          onSetNeedsInfo={() => apiPatch(flagTx.id, { status: "needs_info" }, { status: "needs_info" })}
        />
      )}

      {/* ── Transaction Edit Panel ── */}
      {editTx && !flagTx && (
        <TransactionEditPanel
          tx={editTx}
          accounts={qboAccounts}
          hasQboRealm={hasQboRealm}
          isSavingQbo={savingQbo.has(editTx.id)}
          onClose={() => setEditTxId(null)}
          onSaveMemo={memo => handleSaveMemo(editTx.id, memo)}
          onSaveCategory={(id, name) => handleSaveCategory(editTx.id, id, name)}
          onSaveNotes={notes => handleSaveNotes(editTx.id, notes)}
          onSaveToQbo={() => handleSaveToQbo(editTx.id)}
          onFlag={() => { setEditTxId(null); setFlagTxId(editTx.id); }}
          onResolve={() => { handleResolve(editTx); setEditTxId(null); }}
        />
      )}
    </div>
  );
}

import { useState, useCallback, useEffect, useRef } from "react";
import { useListClients } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Trash2, AlertTriangle, CheckCircle2, ChevronDown,
  Clock, Calendar, AlertCircle, X, Flag,
  MessageSquare, CheckCheck, StickyNote, Filter, ChevronRight,
  Upload, FileSpreadsheet, Search, Mail, Plus, Eye, Download, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PdfViewer } from "@/components/PdfViewer";

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
  flagged_for_client: boolean;
};

type TxData = { imports: TxImport[]; transactions: Tx[] };

// ─── Status config ────────────────────────────────────────────────────────────

type StatusKey = "needs_info" | "awaiting_response" | "responded" | "resolved";

const STATUS_CONFIG: Record<StatusKey, { label: string; badge: string; dot: string }> = {
  needs_info:        { label: "Needs Info",         badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  awaiting_response: { label: "Awaiting Response",  badge: "bg-blue-50 text-blue-700 border-blue-200",    dot: "bg-blue-500" },
  responded:         { label: "Responded",          badge: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  resolved:          { label: "Resolved",           badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
};

const STATUS_ORDER: StatusKey[] = ["needs_info", "awaiting_response", "responded"];

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
  const cfg = STATUS_CONFIG[status as StatusKey] ?? STATUS_CONFIG.needs_info;
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
        placeholder="Add bank description…"
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
      title={value || "Click to add bank description"}
    >
      <span className="truncate">{value || "Add description…"}</span>
    </button>
  );
}

// ─── Account Cell (native select from client account list) ───────────────────

function AccountCell({ tx, accounts, onSave }: {
  tx: Tx;
  accounts: string[];
  onSave: (account: string) => void;
}) {
  if (accounts.length === 0) {
    return (
      <span className="text-xs text-slate-600 truncate block max-w-[150px]" title={tx.account ?? undefined}>
        {tx.account || <span className="text-slate-300">—</span>}
      </span>
    );
  }

  return (
    <div onClick={e => e.stopPropagation()}>
      <select
        value={tx.account ?? ""}
        onChange={e => { e.stopPropagation(); onSave(e.target.value); }}
        onClick={e => e.stopPropagation()}
        className={cn(
          "text-xs rounded-lg px-2 py-1 max-w-[160px] border bg-white focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] cursor-pointer",
          tx.account ? "text-slate-700 border-slate-200" : "text-slate-400 border-dashed border-slate-300"
        )}
      >
        <option value="">Select…</option>
        {accounts.map(a => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Category Cell ────────────────────────────────────────────────────────────

function CategoryCell({ tx }: { tx: Tx }) {
  return (
    <span className="text-xs text-slate-600">
      {tx.category || "—"}
    </span>
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
  const alreadySent = tx.status === "awaiting_response" || tx.status === "responded" || tx.status === "resolved";

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
            <Mail className="w-4 h-4 text-[#266b75]" />
            <span className="font-semibold text-slate-900">Send to Client</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{tx.name || "Unknown Payee"}</p>
              <p className="text-xs text-slate-500 mt-0.5">{fmtDateShort(tx.date)}</p>
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
              <span className="font-medium text-slate-600">Bank Description:</span> {tx.memo}
            </p>
          )}
          <div className="pt-1">
            <StatusBadge status={tx.status} />
          </div>
        </div>

        <div className="flex-1 flex flex-col px-5 py-4 gap-3 overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Message / Question for Client
            </label>
            <textarea
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] resize-none"
              rows={5}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="What would you like to ask the client about this transaction?"
            />
          </div>

          {alreadySent && tx.question_sent_at && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Previously Sent
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
          <button
            onClick={handleSend}
            disabled={!question.trim() || sending}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#266b75] text-white text-sm font-semibold hover:bg-[#1f545d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Mail className="w-4 h-4" />
            {sending ? "Sending…" : alreadySent ? "Resend to Client" : "Send to Client"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Transaction Edit Panel ───────────────────────────────────────────────────

function TransactionEditPanel({
  tx, onClose, onSaveMemo, onSaveCategory, onSaveNotes, onFlag, onResolve, onUploadReceipt,
}: {
  tx: Tx;
  onClose: () => void;
  onSaveMemo: (memo: string) => void;
  onSaveCategory: (categoryName: string) => void;
  onSaveNotes: (notes: string) => void;
  onFlag: () => void;
  onResolve: () => void;
  onUploadReceipt: (file: File) => Promise<void>;
}) {
  const [memo, setMemo] = useState(tx.memo ?? "");
  const [category, setCategory] = useState(tx.category ?? "");
  const [notes, setNotes] = useState(tx.internal_notes ?? "");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [receiptMime, setReceiptMime] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMemo(tx.memo ?? ""); }, [tx.memo]);
  useEffect(() => { setCategory(tx.category ?? ""); }, [tx.category]);
  useEffect(() => { setNotes(tx.internal_notes ?? ""); }, [tx.internal_notes]);

  // Resolve actual mimetype via HEAD so we render image vs PDF correctly
  useEffect(() => {
    setReceiptMime(null);
    if (!tx.receipt_url) return;
    fetch(tx.receipt_url.replace(/\/download$/, "/preview"), { method: "HEAD", credentials: "include" })
      .then(r => setReceiptMime(r.headers.get("content-type")))
      .catch(() => {});
  }, [tx.receipt_url]);

  const handleReceiptFile = async (file: File) => {
    setUploadingReceipt(true);
    try { await onUploadReceipt(file); } finally { setUploadingReceipt(false); }
  };

  // Derive inline-preview URL from receipt_url
  const receiptPreviewUrl = tx.receipt_url
    ? tx.receipt_url.replace(/\/download$/, "/preview")
    : null;
  const receiptIsImage = receiptMime ? receiptMime.startsWith("image/") : false;
  const receiptIsPdf   = receiptMime ? receiptMime === "application/pdf" : false;

  return (
    <>
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
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold text-slate-900 text-xl leading-none">{fmtDateShort(tx.date)}</p>
            <div className="text-right shrink-0">
              {tx.amount != null && tx.amount < 0 && (
                <>
                  <p className="font-mono font-bold text-red-600 text-xl leading-none">${Math.abs(tx.amount).toFixed(2)}</p>
                  <p className="text-xs text-slate-400 mt-1">Debit</p>
                </>
              )}
              {tx.amount != null && tx.amount > 0 && (
                <>
                  <p className="font-mono font-bold text-emerald-700 text-xl leading-none">${tx.amount.toFixed(2)}</p>
                  <p className="text-xs text-slate-400 mt-1">Credit</p>
                </>
              )}
              {tx.amount == null && <p className="text-slate-300 text-xl">—</p>}
            </div>
          </div>
          {tx.transaction_type && (
            <p className="text-xs text-slate-500">{tx.transaction_type}</p>
          )}
          {tx.account && (
            <p className="text-xs text-slate-500"><span className="font-medium text-slate-600">Account:</span> {tx.account}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={tx.status} />
          </div>
        </div>

        {/* Editable fields */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Bank Description</label>
            <input
              type="text"
              value={memo}
              onChange={e => setMemo(e.target.value)}
              onBlur={() => { if (memo !== (tx.memo ?? "")) onSaveMemo(memo); }}
              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setMemo(tx.memo ?? ""); }}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75]"
              placeholder="Add bank description…"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
            <input
              type="text"
              value={category}
              onChange={e => setCategory(e.target.value)}
              onBlur={() => { if (category !== (tx.category ?? "")) onSaveCategory(category); }}
              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setCategory(tx.category ?? ""); }}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75]"
              placeholder="Enter category…"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Notes to Customer</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={() => { if (notes !== (tx.internal_notes ?? "")) onSaveNotes(notes); }}
              rows={4}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] resize-none"
              placeholder="Add a note for the client…"
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

          {/* Receipt / Documents */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Receipt / Document</label>
              <button
                type="button"
                onClick={() => receiptInputRef.current?.click()}
                disabled={uploadingReceipt}
                className="flex items-center gap-1 text-xs font-medium text-[#266b75] hover:text-[#1f545d] disabled:opacity-50 transition-colors"
              >
                {uploadingReceipt ? (
                  <><Upload className="w-3 h-3 animate-pulse" /> Uploading…</>
                ) : (
                  <><Upload className="w-3 h-3" /> {tx.receipt_url ? "Replace" : "Upload"}</>
                )}
              </button>
              <input
                ref={receiptInputRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleReceiptFile(f); e.target.value = ""; }}
              />
            </div>
            {tx.receipt_url ? (
              <div className="space-y-2">
                {/* Thumbnail / icon row */}
                {receiptIsImage ? (
                  <button
                    type="button"
                    onClick={() => setShowReceiptPreview(true)}
                    className="block w-full group text-left"
                  >
                    <img
                      src={receiptPreviewUrl ?? tx.receipt_url}
                      alt="Receipt"
                      className="rounded-xl border border-slate-200 max-w-full object-contain max-h-48 group-hover:opacity-85 transition-opacity"
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowReceiptPreview(true)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                  >
                    <FileText className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-sm text-slate-700 font-medium flex-1 truncate">
                      {tx.receipt_url.split("/").pop() ?? "Document"}
                    </span>
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                )}
                {/* Action links */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowReceiptPreview(true)}
                    className="flex items-center gap-1 text-xs font-medium text-[#266b75] hover:text-[#1f545d] transition-colors"
                  >
                    <Eye className="w-3 h-3" /> Preview
                  </button>
                  <a
                    href={tx.receipt_url}
                    download
                    className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                    onClick={e => e.stopPropagation()}
                  >
                    <Download className="w-3 h-3" /> Download
                  </a>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => receiptInputRef.current?.click()}
                disabled={uploadingReceipt}
                className="w-full flex flex-col items-center gap-2 py-5 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-[#266b75]/40 hover:text-[#266b75] hover:bg-[#266b75]/5 transition-colors disabled:opacity-50"
              >
                <Upload className="w-5 h-5" />
                <span className="text-xs font-medium">Click to attach receipt or document</span>
                <span className="text-xs opacity-70">JPG · PNG · PDF</span>
              </button>
            )}
          </div>

        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-slate-100">
          <div className="flex gap-2">
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
              className="flex-1 px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>

    {/* Receipt Preview Modal */}
    {showReceiptPreview && receiptPreviewUrl && (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={() => setShowReceiptPreview(false)}
      >
        <div
          className="relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ width: "min(92vw, 960px)", height: "min(90vh, 720px)" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-sm font-semibold text-slate-800 truncate">Receipt / Document</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <a
                href={tx.receipt_url!}
                download
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                onClick={e => e.stopPropagation()}
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </a>
              <button
                onClick={() => setShowReceiptPreview(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden bg-slate-50 flex items-center justify-center">
            {receiptIsImage ? (
              <img
                src={receiptPreviewUrl}
                alt="Receipt"
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            ) : (
              <PdfViewer url={receiptPreviewUrl} />
            )}
          </div>
        </div>
      </div>
    )}
  </>
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [flagTxId, setFlagTxId] = useState<number | null>(null);
  const [editTxId, setEditTxId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [clientAccounts, setClientAccounts] = useState<string[]>([]);
  const [newAccountInput, setNewAccountInput] = useState("");
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendNote, setSendNote] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [resolvedCollapsed, setResolvedCollapsed] = useState(false);

  const activeClientIdRef = useRef<number | "">(selectedClientId);

  const activeClients = (clients ?? []).filter(c => (c as any).is_active !== false);
  const selectedClient = activeClients.find(c => c.id === selectedClientId);
  const clientChannel = (selectedClient as any)?.preferred_channel ?? "dashboard";

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

  const loadClientAccounts = useCallback(async (clientId: number) => {
    try {
      const data = await apiFetch(`/api/clients/${clientId}/account-list`);
      setClientAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
    } catch {
      setClientAccounts([]);
    }
  }, []);

  const saveClientAccounts = useCallback(async (clientId: number, accounts: string[]) => {
    try {
      await apiFetch(`/api/clients/${clientId}/account-list`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts }),
      });
      setClientAccounts(accounts);
    } catch (err: any) {
      toast({ title: "Failed to save accounts", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    if (selectedClientId) {
      activeClientIdRef.current = selectedClientId; // authoritative update for programmatic changes
      setTxData(null);
      setTxMap(new Map());
      setEditTxId(null);
      setFlagTxId(null);
      setFilterStatus("all");
      setClientAccounts([]);
      loadTransactions(selectedClientId as number);
      loadClientAccounts(selectedClientId as number);
    } else {
      activeClientIdRef.current = "";
      setTxData(null);
      setTxMap(new Map());
      setLoadError(null);
      setEditTxId(null);
      setFlagTxId(null);
      setClientAccounts([]);
    }
  }, [selectedClientId, loadTransactions, loadClientAccounts]);

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

  const doUpload = async (file: File) => {
    if (!selectedClientId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("client_id", String(selectedClientId));
      const result = await apiFetch("/api/transactions/upload", { method: "POST", body: fd });
      toast({
        title: "Upload complete",
        description: `${result.count} transaction${result.count === 1 ? "" : "s"} imported.`,
      });
      await loadTransactions(selectedClientId as number);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFlag = async (tx: Tx) => {
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

  const handleToggleFlag = async (tx: Tx) => {
    await apiPatch(tx.id, { flagged_for_client: !tx.flagged_for_client }, { flagged_for_client: !tx.flagged_for_client });
  };

  const handleDeleteTx = async (id: number) => {
    try {
      await apiFetch(`/api/transactions/${id}`, { method: "DELETE" });
      setTxData(prev => prev ? { ...prev, transactions: prev.transactions.filter(t => t.id !== id) } : prev);
      setTxMap(prev => { const m = new Map(prev); m.delete(id); return m; });
      toast({ title: "Transaction deleted" });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const handleSendToClient = async () => {
    const flaggedIds = allTx.filter(t => t.flagged_for_client && t.status !== "resolved").map(t => t.id);
    if (!flaggedIds.length || !selectedClientId) return;
    setIsSending(true);
    try {
      await apiFetch("/api/transactions/batch-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: selectedClientId, transaction_ids: flaggedIds, note: sendNote || undefined }),
      });
      const sentAt = new Date().toISOString();
      setTxData(prev => {
        if (!prev) return prev;
        return { ...prev, transactions: prev.transactions.map(t =>
          flaggedIds.includes(t.id) ? { ...t, flagged_for_client: false, status: "awaiting_response", question_sent_at: sentAt } : t
        )};
      });
      setTxMap(prev => {
        const m = new Map(prev);
        flaggedIds.forEach(id => {
          const t = m.get(id);
          if (t) m.set(id, { ...t, flagged_for_client: false, status: "awaiting_response", question_sent_at: sentAt });
        });
        return m;
      });
      toast({ title: "Sent to client", description: `${flaggedIds.length} transaction${flaggedIds.length !== 1 ? "s" : ""} sent for review.` });
      setShowSendModal(false);
      setSendNote("");
    } catch (err: any) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveNotes = async (txId: number, notes: string) => {
    await apiPatch(txId, { internal_notes: notes }, { internal_notes: notes });
  };

  const handleSaveMemo = async (txId: number, memo: string) => {
    await apiPatch(txId, { memo }, { memo });
  };

  const handleSaveCategory = async (txId: number, categoryName: string) => {
    await apiPatch(txId, { category: categoryName }, { category: categoryName, is_uncategorized: false });
  };

  const handleSaveAccount = async (txId: number, account: string) => {
    await apiPatch(txId, { account }, { account });
  };

  const handleUploadReceipt = async (txId: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const result = await apiFetch(`/api/transactions/${txId}/receipt`, { method: "POST", body: fd });
      if (result.transaction) patchTx(txId, result.transaction);
      toast({ title: "Receipt uploaded", description: "Added to transaction and client documents." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      throw err;
    }
  };

  const handleAddAccount = async () => {
    const trimmed = newAccountInput.trim();
    if (!trimmed || !selectedClientId) return;
    if (clientAccounts.includes(trimmed)) { setNewAccountInput(""); return; }
    const updated = [...clientAccounts, trimmed];
    await saveClientAccounts(selectedClientId as number, updated);
    setNewAccountInput("");
  };

  const handleRemoveAccount = async (name: string) => {
    if (!selectedClientId) return;
    const updated = clientAccounts.filter(a => a !== name);
    await saveClientAccounts(selectedClientId as number, updated);
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

  const filtered = filterStatus === "all"
    ? allTx.filter(t => t.status !== "resolved")
    : allTx.filter(t => t.status === filterStatus);
  const resolvedTx = allTx.filter(t => t.status === "resolved");
  const flaggedCount = allTx.filter(t => t.flagged_for_client && t.status !== "resolved").length;

  const flagTx = flagTxId != null ? (txMap.get(flagTxId) ?? null) : null;

  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = allTx.filter(t => t.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const netTotal = filtered.reduce((s, t) => s + (t.amount ?? 0), 0);

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

          {/* QuickBooks button */}
          <div className="shrink-0">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 invisible">QB</label>
            <a
              href="https://qbo.intuit.com/app/homepage"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#2CA01C] text-white hover:bg-[#238016] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4a8 8 0 1 1 0 16A8 8 0 0 1 12 4zm-1 3v2H9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v2h2v-2h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-1V7h-2zm-1 4h4v2H10v-2z"/>
              </svg>
              QuickBooks
            </a>
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

        {/* Account list manager */}
        {selectedClientId && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Account List (for Account dropdown)</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {clientAccounts.map(a => (
                <span key={a} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#266b75]/10 text-[#266b75] text-xs font-medium">
                  {a}
                  <button onClick={() => handleRemoveAccount(a)} className="ml-0.5 text-[#266b75]/60 hover:text-[#266b75] transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {clientAccounts.length === 0 && (
                <span className="text-xs text-slate-400 italic">No accounts added yet</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newAccountInput}
                onChange={e => setNewAccountInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAddAccount(); }}
                placeholder="e.g. Chase Checking"
                className="flex-1 max-w-xs border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75]"
              />
              <button
                onClick={handleAddAccount}
                disabled={!newAccountInput.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
        )}

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

            <div className="ml-auto flex items-center gap-2 shrink-0">
              {/* Send to Client */}
              <button
                onClick={() => setShowSendModal(true)}
                disabled={flaggedCount === 0}
                title={flaggedCount > 0 ? `Send ${flaggedCount} flagged transaction${flaggedCount !== 1 ? "s" : ""} to client` : "Flag transactions to enable send"}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors",
                  flaggedCount > 0
                    ? "bg-[#266b75] text-white hover:bg-[#1f545d]"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                )}
              >
                <Mail className="w-3.5 h-3.5" />
                Send to Client
                {flaggedCount > 0 && (
                  <span className="bg-white/20 px-1.5 py-0.5 rounded-full">{flaggedCount}</span>
                )}
              </button>

            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                  <th className="px-4 py-3.5 w-28">Date</th>
                  <th className="px-4 py-3.5 w-48">Bank Description</th>
                  <th className="px-4 py-3.5 w-40">Account</th>
                  <th className="px-4 py-3.5 w-52">Category</th>
                  <th className="px-4 py-3.5 w-36">Status</th>
                  <th className="px-4 py-3.5 w-28 text-right">Debit</th>
                  <th className="px-4 py-3.5 w-28 text-right">Credit</th>
                  <th className="px-4 py-3.5 w-36">Notes to Customer</th>
                  <th className="px-4 py-3.5 w-28 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-10 text-center text-slate-400 text-sm">
                      No transactions match this filter.
                    </td>
                  </tr>
                ) : filtered.map(tx => {
                  return (
                    <tr
                      key={tx.id}
                      onClick={() => setEditTxId(tx.id)}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                    >
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                        {fmtDateShort(tx.date)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-500 truncate block max-w-[200px]" title={tx.memo ?? undefined}>
                          {tx.memo || <span className="text-slate-300 italic">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <AccountCell tx={tx} accounts={clientAccounts} onSave={account => handleSaveAccount(tx.id, account)} />
                      </td>
                      <td className="px-4 py-3">
                        {tx.category
                          ? <span className="text-xs text-slate-600 truncate block max-w-[190px]" title={tx.category}>{tx.category}</span>
                          : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">Uncategorized</span>
                        }
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
                        <div className="flex items-center justify-center gap-0.5">
                          {/* Flag for client review */}
                          <button
                            onClick={() => handleToggleFlag(tx)}
                            title={tx.flagged_for_client ? "Remove from client review" : "Flag for client review"}
                            className={cn(
                              "p-1.5 rounded-lg transition-colors",
                              tx.flagged_for_client
                                ? "text-[#266b75] bg-[#266b75]/10 hover:bg-[#266b75]/20"
                                : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"
                            )}
                          >
                            <Flag className="w-3.5 h-3.5" />
                          </button>

                          {/* Mark resolved */}
                          <button
                            onClick={() => handleResolve(tx)}
                            title="Mark as resolved"
                            className="p-1.5 rounded-lg text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDeleteTx(tx.id)}
                            title="Delete transaction"
                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
              {filtered.length} of {allTx.filter(t => t.status !== "resolved").length} active transaction{allTx.filter(t => t.status !== "resolved").length !== 1 ? "s" : ""}
              {filterStatus !== "all" && <span className="ml-1 text-slate-400">(filtered)</span>}
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

      {/* ── Resolved Section ── */}
      {selectedClientId && !loading && resolvedTx.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setResolvedCollapsed(c => !c)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <CheckCheck className="w-4 h-4 text-emerald-500" />
              <span className="font-semibold text-slate-700">Resolved</span>
              <span className="text-xs text-slate-400 font-medium">
                {resolvedTx.length} transaction{resolvedTx.length !== 1 ? "s" : ""}
              </span>
            </div>
            <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", !resolvedCollapsed && "rotate-180")} />
          </button>
          {!resolvedCollapsed && (
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                    <th className="px-4 py-3 w-28">Date</th>
                    <th className="px-4 py-3 w-48">Bank Description</th>
                    <th className="px-4 py-3 w-52">Category</th>
                    <th className="px-4 py-3 w-28 text-right">Debit</th>
                    <th className="px-4 py-3 w-28 text-right">Credit</th>
                    <th className="px-4 py-3 text-right w-32">Resolved On</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resolvedTx.map(tx => (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors cursor-pointer" onClick={() => setEditTxId(tx.id)}>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDateShort(tx.date)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-400 truncate block max-w-[200px]">{tx.memo || "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-400 truncate block max-w-[190px]">{tx.category || "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {tx.amount != null && tx.amount < 0
                          ? <span className="font-mono text-sm text-slate-400">${Math.abs(tx.amount).toFixed(2)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {tx.amount != null && tx.amount > 0
                          ? <span className="font-mono text-sm text-slate-400">${tx.amount.toFixed(2)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-slate-400">{tx.resolved_at ? fmtDateShort(tx.resolved_at) : "—"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Send to Client Modal ── */}
      {showSendModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowSendModal(false)}
        >
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Send to Client</h3>
            <p className="text-sm text-slate-500 mb-4">
              {flaggedCount} flagged transaction{flaggedCount !== 1 ? "s" : ""} will be emailed to{" "}
              <span className="font-medium text-slate-700">
                {(selectedClient as any)?.contact_name || (selectedClient as any)?.name || "the client"}
              </span>{" "}
              for review.
            </p>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Note to client (optional)
            </label>
            <textarea
              value={sendNote}
              onChange={e => setSendNote(e.target.value)}
              placeholder="Add a message to include with the email…"
              rows={3}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] resize-none mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowSendModal(false); setSendNote(""); }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendToClient}
                disabled={isSending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#266b75] text-white text-sm font-semibold hover:bg-[#1f545d] transition-colors disabled:opacity-60"
              >
                <Mail className="w-4 h-4" />
                {isSending ? "Sending…" : "Send Email"}
              </button>
            </div>
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
          onClose={() => setEditTxId(null)}
          onSaveMemo={memo => handleSaveMemo(editTx.id, memo)}
          onSaveCategory={name => handleSaveCategory(editTx.id, name)}
          onSaveNotes={notes => handleSaveNotes(editTx.id, notes)}
          onFlag={() => { setEditTxId(null); setFlagTxId(editTx.id); }}
          onResolve={() => { handleResolve(editTx); setEditTxId(null); }}
          onUploadReceipt={file => handleUploadReceipt(editTx.id, file)}
        />
      )}
    </div>
  );
}

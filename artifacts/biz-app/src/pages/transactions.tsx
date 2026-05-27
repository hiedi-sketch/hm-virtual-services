import { useState, useRef, useCallback, useEffect } from "react";
import { useListClients } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, Trash2, AlertTriangle, CheckCircle2, ChevronDown,
  FileSpreadsheet, Clock, Calendar, AlertCircle, X,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

type TxImport = {
  id: number;
  client_id: number;
  filename: string;
  date_range_start: string | null;
  date_range_end: string | null;
  imported_at: string;
  row_count: number;
};

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
};

type TxData = { imports: TxImport[]; transactions: Tx[] };

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
    const p = d.includes("/") ? new Date(d) : new Date(d + "T00:00:00");
    return p.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return d; }
}

function AmountCell({ amount }: { amount: number | null | undefined }) {
  if (amount == null) return <span className="text-slate-300">—</span>;
  const neg = amount < 0;
  return (
    <span className={cn("font-mono text-sm font-medium", neg ? "text-red-600" : "text-emerald-700")}>
      {neg ? `-$${Math.abs(amount).toFixed(2)}` : `$${amount.toFixed(2)}`}
    </span>
  );
}

export default function TransactionsPage() {
  const { data: clients } = useListClients();
  const { toast } = useToast();

  const [selectedClientId, setSelectedClientId] = useState<number | "">("");
  const [txData, setTxData] = useState<TxData | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<{ file: File; existing: TxImport; message: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeClients = (clients ?? []).filter(c => (c as any).is_active !== false);

  const loadTransactions = useCallback(async (clientId: number) => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/transactions?client_id=${clientId}`);
      setTxData(data);
    } catch (err: any) {
      toast({ title: "Failed to load transactions", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (selectedClientId) loadTransactions(selectedClientId as number);
    else setTxData(null);
  }, [selectedClientId, loadTransactions]);

  const doUpload = async (file: File, overwrite = false) => {
    if (!selectedClientId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("client_id", String(selectedClientId));
      fd.append("overwrite", String(overwrite));

      const result = await apiFetch("/api/transactions/upload", { method: "POST", body: fd });
      setConflictInfo(null);
      toast({ title: "Transactions imported", description: `${result.count} rows loaded.` });
      await loadTransactions(selectedClientId as number);
    } catch (err: any) {
      if (err.status === 409 && err.body?.conflict) {
        setConflictInfo({ file, existing: err.body.existing_import, message: err.body.message });
      } else {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    doUpload(file);
  };

  const handleDeleteImport = async (importId: number) => {
    try {
      await apiFetch(`/api/transactions/import/${importId}`, { method: "DELETE" });
      toast({ title: "Import deleted" });
      if (selectedClientId) await loadTransactions(selectedClientId as number);
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const latestImport = txData?.imports.slice(-1)[0];

  const allTx = txData?.transactions ?? [];
  const uncategorized = allTx.filter(t => t.is_uncategorized);
  const categorized = allTx.filter(t => !t.is_uncategorized);
  const sorted = [...uncategorized, ...categorized];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Transactions</h1>
          <p className="text-slate-500 mt-1">Import and review QuickBooks transaction exports per client.</p>
        </div>
      </div>

      {/* Controls bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Client selector */}
          <div className="relative flex-1 max-w-xs">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Client</label>
            <div className="relative">
              <select
                value={selectedClientId}
                onChange={e => setSelectedClientId(e.target.value ? Number(e.target.value) : "")}
                className="w-full appearance-none border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] pr-8"
              >
                <option value="">— Select a client —</option>
                {activeClients.map(c => (
                  <option key={c.id} value={c.id}>{c.contact_name || c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Date range label */}
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date Range</label>
            {latestImport ? (
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="font-medium">{fmtDateShort(latestImport.date_range_start)}</span>
                <span className="text-slate-400">–</span>
                <span className="font-medium">{fmtDateShort(latestImport.date_range_end)}</span>
              </div>
            ) : (
              <div className="text-sm text-slate-400 italic">No data uploaded yet</div>
            )}
          </div>

          {/* Upload button */}
          <div className="shrink-0">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 invisible">Upload</label>
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
              <Upload className="w-4 h-4" />
              {uploading ? "Uploading…" : "Upload Transactions"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>

        {/* Last uploaded timestamp + import list */}
        {txData && txData.imports.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Upload History</p>
            {txData.imports.map(imp => (
              <div key={imp.id} className="flex items-center justify-between gap-3 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-medium text-slate-700 truncate max-w-[200px]">{imp.filename}</span>
                  <span className="text-slate-400">·</span>
                  <span>{imp.row_count} rows</span>
                  <span className="text-slate-400">·</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {fmtDate(imp.imported_at)}
                  </span>
                </div>
                {deleteConfirmId === imp.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-red-600 font-medium">Delete this import?</span>
                    <button
                      onClick={() => handleDeleteImport(imp.id)}
                      className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                    >Yes</button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    >Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmId(imp.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded"
                    title="Delete import"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conflict warning dialog */}
      {conflictInfo && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-900">Duplicate Date Range</p>
            <p className="text-sm text-amber-800 mt-1">{conflictInfo.message}</p>
            <p className="text-xs text-amber-700 mt-1">
              Previously uploaded: <span className="font-medium">{conflictInfo.existing.filename}</span> on {fmtDate(conflictInfo.existing.imported_at)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => doUpload(conflictInfo.file, true)}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Overwrite
            </button>
            <button
              onClick={() => setConflictInfo(null)}
              className="p-2 rounded-xl text-amber-600 hover:bg-amber-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* No client selected */}
      {!selectedClientId && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-16 text-center">
          <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">Select a client to view transactions</p>
          <p className="text-slate-400 text-sm mt-1">Then upload a QuickBooks CSV or XLSX export.</p>
        </div>
      )}

      {/* Loading */}
      {selectedClientId && loading && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-12 text-center text-slate-400 text-sm">
          Loading transactions…
        </div>
      )}

      {/* No transactions yet */}
      {selectedClientId && !loading && txData && txData.transactions.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-16 text-center">
          <Upload className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">No transactions imported yet</p>
          <p className="text-slate-400 text-sm mt-1">Upload a .csv or .xlsx export from QuickBooks above.</p>
        </div>
      )}

      {/* Transaction table */}
      {selectedClientId && !loading && sorted.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Uncategorized notice */}
          {uncategorized.length > 0 && (
            <div className="flex items-center gap-2 px-5 py-3 bg-amber-50 border-b border-amber-100">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-sm text-amber-800 font-medium">
                {uncategorized.length} uncategorized transaction{uncategorized.length !== 1 ? "s" : ""} — shown at top
              </span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                  <th className="px-5 py-3.5 w-28">Date</th>
                  <th className="px-5 py-3.5 w-36">Type</th>
                  <th className="px-5 py-3.5">Vendor / Payee</th>
                  <th className="px-5 py-3.5">Account / Category</th>
                  <th className="px-5 py-3.5">Memo</th>
                  <th className="px-5 py-3.5 text-right w-32">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((tx, i) => (
                  <tr
                    key={tx.id}
                    className={cn(
                      "hover:bg-slate-50 transition-colors",
                      tx.is_uncategorized && "bg-amber-50/40 hover:bg-amber-50"
                    )}
                  >
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                      {fmtDateShort(tx.date)}
                    </td>
                    <td className="px-5 py-3">
                      {tx.transaction_type ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          {tx.transaction_type}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-800 max-w-[200px] truncate">
                      {tx.name || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3 max-w-[200px]">
                      {tx.is_uncategorized ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                          <AlertCircle className="w-3 h-3" /> Uncategorized
                        </span>
                      ) : (
                        <span className="text-slate-600 truncate block">{tx.account}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs max-w-[220px] truncate" title={tx.memo ?? ""}>
                      {tx.memo || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <AmountCell amount={tx.amount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
            <span>{sorted.length} transaction{sorted.length !== 1 ? "s" : ""}</span>
            <span>
              Total:{" "}
              <span className="font-semibold text-slate-700">
                {sorted.reduce((s, t) => s + (t.amount ?? 0), 0) < 0
                  ? `-$${Math.abs(sorted.reduce((s, t) => s + (t.amount ?? 0), 0)).toFixed(2)}`
                  : `$${sorted.reduce((s, t) => s + (t.amount ?? 0), 0).toFixed(2)}`}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

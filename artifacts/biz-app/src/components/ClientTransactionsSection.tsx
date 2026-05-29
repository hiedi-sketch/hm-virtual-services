import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, BookOpen, AlertCircle, ChevronDown, ChevronUp,
  ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

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
};

type StatusKey = "uncategorized" | "needs_info" | "awaiting_response" | "responded" | "resolved";

const STATUS_CONFIG: Record<StatusKey, { label: string; badge: string; dot: string }> = {
  uncategorized:     { label: "Uncategorized",    badge: "bg-red-50 text-red-700 border-red-200",          dot: "bg-red-500" },
  needs_info:        { label: "Needs Info",        badge: "bg-amber-50 text-amber-700 border-amber-200",    dot: "bg-amber-500" },
  awaiting_response: { label: "Awaiting Response", badge: "bg-blue-50 text-blue-700 border-blue-200",       dot: "bg-blue-500" },
  responded:         { label: "Responded",         badge: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  resolved:          { label: "Resolved",          badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

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

type SortField = "date" | "name" | "amount" | "account" | "status";
type SortDir = "asc" | "desc";

// ─── Component ────────────────────────────────────────────────────────────────

export function ClientTransactionsSection({ client }: { client: any }) {
  const { toast } = useToast();

  const realmIds: string[] = (() => {
    if (client?.qbo_realm_ids) {
      try { return JSON.parse(client.qbo_realm_ids); } catch {}
    }
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

  const loadTransactions = useCallback(async () => {
    if (!hasQbo) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/qbo/clients/${client.id}/transactions`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setTransactions(data.transactions ?? []);
      setLastSync(data.lastSync ?? null);
    } catch {}
    finally { setLoading(false); }
  }, [client.id, hasQbo]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const handleSync = async () => {
    if (!startDate || !endDate) {
      toast({ title: "Please select a date range", variant: "destructive" });
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch(`/api/qbo/clients/${client.id}/sync-transactions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      toast({ title: `Synced ${data.synced} transactions from QuickBooks` });
      await loadTransactions();
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "amount" ? "desc" : "asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3.5 h-3.5 text-[#266b75]" />
      : <ArrowDown className="w-3.5 h-3.5 text-[#266b75]" />;
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

  // Uncategorized always surfaces first
  const uncategorized = sorted.filter(t => t.is_uncategorized || t.status === "uncategorized");
  const categorized   = sorted.filter(t => !t.is_uncategorized && t.status !== "uncategorized");
  const ordered = [...uncategorized, ...categorized];

  const PAGE_SIZE = 50;
  const displayed = showAll ? ordered : ordered.slice(0, PAGE_SIZE);

  const thCls = "px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap select-none";
  const thBtn = (field: SortField) => (
    <button
      onClick={() => toggleSort(field)}
      className="inline-flex items-center gap-1 hover:text-slate-700 transition-colors"
    >
      {field === "date" ? "Date" : field === "name" ? "Vendor / Name" : field === "amount" ? "Amount" : field === "account" ? "Category" : "Status"}
      <SortIcon field={field} />
    </button>
  );

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="w-5 h-5 text-slate-500" />
        <h2 className="text-lg font-semibold text-slate-900">Transactions</h2>
        {transactions.length > 0 && (
          <span className="text-xs text-slate-400">({transactions.length})</span>
        )}
        {lastSync && (
          <span className="ml-auto text-xs text-slate-400">
            Last synced {fmtSyncTime(lastSync)}
          </span>
        )}
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
          {/* Sync controls */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <label className="font-medium text-slate-500 text-xs uppercase tracking-wider">From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30"
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <label className="font-medium text-slate-500 text-xs uppercase tracking-wider">To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30"
                />
              </div>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
                style={{ background: "#266b75" }}
              >
                <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
                {syncing ? "Syncing…" : "Sync from QuickBooks"}
              </button>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-400">
              Loading transactions…
            </div>
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
                  <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-xs font-semibold text-red-700">
                    {uncategorized.length} uncategorized {uncategorized.length === 1 ? "transaction" : "transactions"} — review needed
                  </span>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className={thCls}>{thBtn("date")}</th>
                      <th className={thCls}>{thBtn("name")}</th>
                      <th className={thCls}>Type</th>
                      <th className={thCls}>{thBtn("amount")}</th>
                      <th className={thCls}>{thBtn("account")}</th>
                      <th className={thCls}>Memo</th>
                      <th className={thCls}>{thBtn("status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayed.map(tx => (
                      <tr
                        key={tx.id}
                        className={cn(
                          "hover:bg-slate-50/50 transition-colors",
                          (tx.is_uncategorized || tx.status === "uncategorized") && "bg-red-50/40"
                        )}
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-600 text-xs">
                          {fmtDateShort(tx.date)}
                        </td>
                        <td className="px-4 py-2.5 max-w-[180px]">
                          <span className="font-medium text-slate-800 truncate block">{tx.name || <span className="text-slate-300">—</span>}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                          {tx.transaction_type || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <AmountCell amount={tx.amount} />
                        </td>
                        <td className="px-4 py-2.5 max-w-[200px]">
                          {tx.account ? (
                            <span className="text-xs text-slate-600 truncate block">{tx.account}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium">
                              <AlertCircle className="w-3 h-3" /> Uncategorized
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 max-w-[200px]">
                          <span className="text-xs text-slate-400 truncate block">{tx.memo || "—"}</span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <StatusBadge status={tx.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {ordered.length > PAGE_SIZE && (
                <div className="px-4 py-3 border-t border-slate-100 text-center">
                  <button
                    onClick={() => setShowAll(v => !v)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#266b75] hover:underline"
                  >
                    {showAll ? (
                      <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                    ) : (
                      <><ChevronDown className="w-3.5 h-3.5" /> Show all {ordered.length} transactions</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

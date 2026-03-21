import { useState } from "react";
import {
  useListInvoices,
  useCreateInvoice,
  useUpdateInvoice,
  useDeleteInvoice,
  useListClients,
  getListInvoicesQueryKey,
  Invoice,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  X,
  Trash2,
  CheckCircle2,
  Clock,
  FileText,
  ChevronDown,
  Download,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isOverdue(due_date: string, status: string) {
  if (status === "paid") return false;
  return new Date(due_date + "T00:00:00") < new Date(new Date().toDateString());
}

export default function Invoices() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [filterClient, setFilterClient] = useState<number | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<"all" | "paid" | "unpaid">("all");
  const [showForm, setShowForm] = useState(false);

  const [formClientId, setFormClientId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStatus, setFormStatus] = useState<"paid" | "unpaid">("unpaid");

  const { data: invoices = [], isLoading } = useListInvoices(
    filterClient ? { clientId: filterClient } : undefined,
  );
  const { data: clients = [] } = useListClients();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });

  const createMutation = useCreateInvoice({
    mutation: {
      onSuccess: () => {
        invalidate();
        setShowForm(false);
        setFormClientId("");
        setFormAmount("");
        setFormDueDate("");
        setFormDescription("");
        setFormStatus("unpaid");
        toast({ title: "Invoice created" });
      },
      onError: () => toast({ title: "Failed to create invoice", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateInvoice({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Invoice updated" });
      },
    },
  });

  const deleteMutation = useDeleteInvoice({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Invoice deleted" });
      },
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formClientId || !formAmount || !formDueDate) return;
    createMutation.mutate({
      data: {
        client_id: Number(formClientId),
        amount: Number(formAmount),
        due_date: formDueDate,
        description: formDescription.trim() || null,
        status: formStatus,
      },
    });
  };

  const toggleStatus = (inv: Invoice) => {
    updateMutation.mutate({
      id: inv.id,
      data: { status: inv.status === "paid" ? "unpaid" : "paid" },
    });
  };

  const filtered = invoices.filter(inv => {
    if (filterStatus === "paid" && inv.status !== "paid") return false;
    if (filterStatus === "unpaid" && inv.status !== "unpaid") return false;
    return true;
  });

  const totalPaid = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalUnpaid = invoices.filter(i => i.status === "unpaid").reduce((s, i) => s + i.amount, 0);

  const getClientName = (id: number) => clients.find(c => c.id === id)?.name ?? `Client #${id}`;

  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const downloadPdf = async (inv: Invoice) => {
    if (downloadingId !== null) return;
    setDownloadingId(inv.id);
    try {
      const res = await fetch(`/api/invoices/${inv.id}/pdf`, { credentials: "include" });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${inv.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Failed to download PDF", variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Invoices</h1>
          <p className="text-slate-500 mt-1">Track payments and outstanding balances.</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-xl text-sm transition-colors shrink-0"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancel" : "New Invoice"}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Paid</p>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalPaid)}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Outstanding</p>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalUnpaid)}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">All Invoices</p>
            <p className="text-2xl font-bold text-slate-900">{invoices.length}</p>
          </div>
        </div>
      </div>

      {/* New Invoice Form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6 space-y-4"
        >
          <h2 className="font-semibold text-slate-900">New Invoice</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Client <span className="text-red-400">*</span>
              </label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                value={formClientId}
                onChange={e => setFormClientId(e.target.value)}
                required
              >
                <option value="">Select a client…</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Amount ($) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
                value={formAmount}
                onChange={e => setFormAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Due Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                value={formDueDate}
                onChange={e => setFormDueDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                value={formStatus}
                onChange={e => setFormStatus(e.target.value as "paid" | "unpaid")}
              >
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Description (optional)</label>
              <input
                type="text"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. March bookkeeping services"
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating…" : "Create Invoice"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-slate-500 hover:text-slate-900 px-4 py-2 rounded-lg border border-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filterClient ?? ""}
          onChange={e => setFilterClient(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">All Clients</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
          {(["all", "unpaid", "paid"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 font-medium transition-colors capitalize ${
                filterStatus === s
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {s === "all" ? "All" : s === "paid" ? "Paid" : "Unpaid"}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-white rounded-xl border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-16 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No invoices found</p>
          <p className="text-slate-400 text-sm mt-1">Create your first invoice to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filtered.map(inv => {
              const overdue = isOverdue(inv.due_date, inv.status);
              return (
                <div
                  key={inv.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 hover:bg-slate-50/60 transition-colors"
                >
                  {/* Status toggle */}
                  <button
                    onClick={() => toggleStatus(inv)}
                    disabled={updateMutation.isPending}
                    title={inv.status === "paid" ? "Mark unpaid" : "Mark paid"}
                    className={`shrink-0 transition-colors ${
                      inv.status === "paid"
                        ? "text-emerald-500 hover:text-emerald-600"
                        : "text-slate-300 hover:text-emerald-500"
                    }`}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                  </button>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {formatCurrency(inv.amount)}
                      </span>
                      <span className="text-slate-400 text-sm">·</span>
                      <span className="text-sm text-slate-600">{getClientName(inv.client_id)}</span>
                      {inv.description && (
                        <>
                          <span className="text-slate-400 text-sm">·</span>
                          <span className="text-sm text-slate-500 truncate">{inv.description}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs ${overdue ? "text-red-500 font-medium" : "text-slate-400"}`}>
                        {overdue ? "Overdue · " : "Due "}
                        {formatDate(inv.due_date)}
                      </span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <span
                    className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                      inv.status === "paid"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : overdue
                        ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}
                  >
                    {inv.status === "paid" ? "Paid" : overdue ? "Overdue" : "Unpaid"}
                  </span>

                  {/* Download PDF */}
                  <button
                    onClick={() => downloadPdf(inv)}
                    disabled={downloadingId === inv.id}
                    className="shrink-0 text-slate-300 hover:text-blue-500 transition-colors"
                    title="Download PDF"
                  >
                    {downloadingId === inv.id ? (
                      <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin inline-block" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => deleteMutation.mutate({ id: inv.id })}
                    disabled={deleteMutation.isPending}
                    className="shrink-0 text-slate-300 hover:text-red-500 transition-colors"
                    title="Delete invoice"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

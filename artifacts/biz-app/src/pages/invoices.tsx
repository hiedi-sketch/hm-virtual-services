import React, { useState, useEffect, useCallback } from "react";
import {
  useListInvoices,
  useCreateInvoice,
  useUpdateInvoice,
  useDeleteInvoice,
  useListClients,
  useListServices,
  getListInvoicesQueryKey,
  Invoice,
  LineItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Modal } from "@/components/Modal";
import {
  Plus,
  X,
  Trash2,
  CheckCircle2,
  Clock,
  FileText,
  Download,
  CreditCard,
  Pencil,
  BanIcon,
  DollarSign,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type DraftItem = {
  _id: string;
  name: string;
  description: string;
  qty: number;
  unit_price: number;
};

function newItem(overrides?: Partial<DraftItem>): DraftItem {
  return {
    _id: Math.random().toString(36).slice(2),
    name: "",
    description: "",
    qty: 1,
    unit_price: 0,
    ...overrides,
  };
}

function calcTotal(items: DraftItem[]) {
  return items.reduce((s, it) => s + it.qty * it.unit_price, 0);
}

function draftToLineItem(d: DraftItem): LineItem {
  return { name: d.name, description: d.description || undefined, qty: d.qty, unit_price: d.unit_price };
}

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "venmo", label: "Venmo" },
  { value: "paypal", label: "PayPal" },
  { value: "zelle", label: "Zelle" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "other", label: "Other" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function todayStr() {
  return new Date().toISOString().split("T")[0]!;
}

function isOverdue(due_date: string, status: string) {
  if (status === "paid" || status === "void") return false;
  return due_date < todayStr();
}

function statusBadge(inv: Invoice) {
  if (inv.status === "void")
    return "bg-slate-100 text-slate-500 border-slate-200";
  if (inv.status === "paid")
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (isOverdue(inv.due_date, inv.status))
    return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function statusLabel(inv: Invoice) {
  if (inv.status === "void") return "Void";
  if (inv.status === "paid") return "Paid";
  if (isOverdue(inv.due_date, inv.status)) return "Overdue";
  return "Unpaid";
}

// ── Input class ───────────────────────────────────────────────────────────────
const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white";

// ── Line Items Editor ─────────────────────────────────────────────────────────

function LineItemsEditor({
  items,
  onChange,
  services,
}: {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  services: { id: number; name: string; description?: string | null; price: number; active: boolean }[];
}) {
  const [addServiceId, setAddServiceId] = useState("");

  const update = (id: string, field: keyof DraftItem, value: string | number) => {
    onChange(items.map(it => it._id === id ? { ...it, [field]: value } : it));
  };

  const remove = (id: string) => {
    onChange(items.filter(it => it._id !== id));
  };

  const addCustom = () => {
    onChange([...items, newItem()]);
  };

  const addFromService = () => {
    if (!addServiceId) return;
    const svc = services.find(s => String(s.id) === addServiceId);
    if (!svc) return;
    onChange([...items, newItem({
      name: svc.name,
      description: svc.description ?? "",
      qty: 1,
      unit_price: svc.price,
    })]);
    setAddServiceId("");
  };

  const activeServices = services.filter(s => s.active);

  return (
    <div className="space-y-3">
      {/* Service picker */}
      {activeServices.length > 0 && (
        <div className="flex gap-2">
          <select
            className={cn(inputCls, "flex-1")}
            value={addServiceId}
            onChange={e => setAddServiceId(e.target.value)}
          >
            <option value="">Add from service catalog…</option>
            {activeServices.map(s => (
              <option key={s.id} value={s.id}>{s.name} — {formatCurrency(s.price)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={addFromService}
            disabled={!addServiceId}
            className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0"
          >
            Add
          </button>
        </div>
      )}

      {/* Line item rows */}
      {items.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_3fr_2fr_1.5fr_1.5fr_auto] gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <span>Qty</span>
            <span>Item</span>
            <span>Description</span>
            <span>Unit Price</span>
            <span className="text-right">Total</span>
            <span />
          </div>
          {items.map(it => (
            <div key={it._id} className="grid grid-cols-[1fr_3fr_2fr_1.5fr_1.5fr_auto] gap-2 px-3 py-2 border-b border-slate-100 last:border-0 items-center">
              <input
                type="number"
                min={0.01}
                step={0.01}
                className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={it.qty}
                onChange={e => update(it._id, "qty", Number(e.target.value))}
              />
              <input
                type="text"
                className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="Item name"
                value={it.name}
                onChange={e => update(it._id, "name", e.target.value)}
              />
              <input
                type="text"
                className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="Description"
                value={it.description}
                onChange={e => update(it._id, "description", e.target.value)}
              />
              <input
                type="number"
                min={0}
                step={0.01}
                className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="0.00"
                value={it.unit_price}
                onChange={e => update(it._id, "unit_price", Number(e.target.value))}
              />
              <span className="text-right text-sm font-medium text-slate-700">
                {formatCurrency(it.qty * it.unit_price)}
              </span>
              <button
                type="button"
                onClick={() => remove(it._id)}
                className="p-1 text-slate-300 hover:text-red-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <div className="flex justify-end px-3 py-2 bg-slate-50 border-t border-slate-200">
            <span className="text-sm font-bold text-slate-900">
              Total: {formatCurrency(calcTotal(items))}
            </span>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={addCustom}
        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add custom line item
      </button>
    </div>
  );
}

// ── Mark as Paid Modal ────────────────────────────────────────────────────────

function MarkAsPaidModal({
  invoice,
  onClose,
  onConfirm,
  isPending,
}: {
  invoice: Invoice;
  onClose: () => void;
  onConfirm: (data: { paid_at: string; payment_method: string; payment_notes: string }) => void;
  isPending: boolean;
}) {
  const [paidAt, setPaidAt] = useState(todayStr());
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm({ paid_at: paidAt, payment_method: method, payment_notes: notes });
  };

  return (
    <Modal isOpen title="Record Payment" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
          <DollarSign className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Invoice #{invoice.id}</p>
            <p className="text-xs text-emerald-600">{formatCurrency(invoice.amount)}</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Payment Date</label>
          <input
            type="date"
            className={inputCls}
            value={paidAt}
            onChange={e => setPaidAt(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Payment Method</label>
          <select
            className={inputCls}
            value={method}
            onChange={e => setMethod(e.target.value)}
          >
            {PAYMENT_METHODS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Notes (optional)</label>
          <textarea
            className={cn(inputCls, "resize-none")}
            rows={2}
            placeholder="e.g. Check #1234, received in full"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Mark as Paid"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Invoice Form (Create or Edit) ─────────────────────────────────────────────

function InvoiceForm({
  invoice,
  clients,
  services,
  onSubmit,
  onCancel,
  isPending,
}: {
  invoice?: Invoice;
  clients: { id: number; name: string }[];
  services: { id: number; name: string; description?: string | null; price: number; active: boolean }[];
  onSubmit: (data: {
    client_id: number;
    amount: number;
    due_date: string;
    description: string | null;
    line_items: LineItem[] | null;
    notes: string | null;
    thank_you_message: string | null;
  }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const isEdit = !!invoice;

  const [clientId, setClientId] = useState(invoice ? String(invoice.client_id) : "");
  const [dueDate, setDueDate] = useState(invoice?.due_date ?? "");
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [thankYou, setThankYou] = useState(invoice?.thank_you_message ?? "");
  const [description, setDescription] = useState(invoice?.description ?? "");
  const [manualAmount, setManualAmount] = useState<string>(
    invoice && (!invoice.line_items || invoice.line_items.length === 0)
      ? String(invoice.amount)
      : ""
  );

  const initialItems: DraftItem[] = invoice?.line_items?.map(li => ({
    _id: Math.random().toString(36).slice(2),
    name: li.name,
    description: li.description ?? "",
    qty: li.qty,
    unit_price: li.unit_price,
  })) ?? [];

  const [lineItems, setLineItems] = useState<DraftItem[]>(initialItems);
  const [showAdvanced, setShowAdvanced] = useState(!!(invoice?.notes || invoice?.thank_you_message));

  const hasItems = lineItems.length > 0;
  const total = hasItems ? calcTotal(lineItems) : Number(manualAmount) || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !dueDate) return;
    if (!hasItems && !manualAmount) return;

    onSubmit({
      client_id: Number(clientId),
      amount: total,
      due_date: dueDate,
      description: description.trim() || null,
      line_items: hasItems ? lineItems.map(draftToLineItem) : null,
      notes: notes.trim() || null,
      thank_you_message: thankYou.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Client + Due Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Client <span className="text-red-400">*</span>
          </label>
          <select
            className={inputCls}
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            required
            disabled={isEdit}
          >
            <option value="">Select a client…</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Due Date <span className="text-red-400">*</span>
          </label>
          <input
            type="date"
            className={inputCls}
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Line Items */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-2">
          Line Items {hasItems && <span className="text-blue-500">({lineItems.length})</span>}
        </label>
        <LineItemsEditor items={lineItems} onChange={setLineItems} services={services} />
      </div>

      {/* Manual amount fallback (if no line items) */}
      {!hasItems && (
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Total Amount ($) <span className="text-red-400">*</span>
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputCls}
            placeholder="0.00"
            value={manualAmount}
            onChange={e => setManualAmount(e.target.value)}
            required={!hasItems}
          />
        </div>
      )}

      {/* Optional description */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Description / Memo</label>
        <input
          type="text"
          className={inputCls}
          placeholder="e.g. March bookkeeping services"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      {/* Advanced toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(v => !v)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
      >
        {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {showAdvanced ? "Hide" : "Show"} notes & thank-you message
      </button>

      {showAdvanced && (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Notes (internal / terms)</label>
            <textarea
              className={cn(inputCls, "resize-none")}
              rows={2}
              placeholder="e.g. Payment due net 15. Late fees apply."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Thank-you Message</label>
            <textarea
              className={cn(inputCls, "resize-none")}
              rows={2}
              placeholder="e.g. Thank you for your business!"
              value={thankYou}
              onChange={e => setThankYou(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Total summary */}
      {total > 0 && (
        <div className="flex justify-end">
          <div className="bg-slate-900 text-white rounded-xl px-5 py-3 text-right">
            <p className="text-xs text-slate-400 mb-0.5">Invoice Total</p>
            <p className="text-xl font-bold">{formatCurrency(total)}</p>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {isPending ? (isEdit ? "Saving…" : "Creating…") : (isEdit ? "Save Changes" : "Create Invoice")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-slate-500 hover:text-slate-900 px-4 py-2 rounded-lg border border-slate-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Main Invoices Page ────────────────────────────────────────────────────────

export default function Invoices() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [filterClient, setFilterClient] = useState<number | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<"all" | "paid" | "unpaid" | "void">("all");
  const [showForm, setShowForm] = useState(false);

  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [markingPaidInvoice, setMarkingPaidInvoice] = useState<Invoice | null>(null);
  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { data: invoices = [], isLoading } = useListInvoices(
    filterClient ? { clientId: filterClient } : undefined,
  );
  const { data: clients = [] } = useListClients();
  const { data: services = [] } = useListServices();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });

  const createMutation = useCreateInvoice({
    mutation: {
      onSuccess: () => {
        invalidate();
        setShowForm(false);
        toast({ title: "Invoice created" });
      },
      onError: () => toast({ title: "Failed to create invoice", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateInvoice({
    mutation: {
      onSuccess: () => {
        invalidate();
        setEditingInvoice(null);
        setMarkingPaidInvoice(null);
        setVoidingId(null);
        toast({ title: "Invoice updated" });
      },
      onError: () => toast({ title: "Failed to update invoice", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteInvoice({
    mutation: {
      onSuccess: () => {
        invalidate();
        setDeleteConfirmId(null);
        toast({ title: "Invoice deleted" });
      },
      onError: () => toast({ title: "Failed to delete invoice", variant: "destructive" }),
    },
  });

  const handleCreate = useCallback((data: {
    client_id: number; amount: number; due_date: string;
    description: string | null; line_items: LineItem[] | null;
    notes: string | null; thank_you_message: string | null;
  }) => {
    createMutation.mutate({ data: { ...data, status: "unpaid" } });
  }, [createMutation]);

  const handleEdit = useCallback((data: {
    client_id: number; amount: number; due_date: string;
    description: string | null; line_items: LineItem[] | null;
    notes: string | null; thank_you_message: string | null;
  }) => {
    if (!editingInvoice) return;
    updateMutation.mutate({ id: editingInvoice.id, data });
  }, [editingInvoice, updateMutation]);

  const handleMarkPaid = useCallback((payData: {
    paid_at: string; payment_method: string; payment_notes: string;
  }) => {
    if (!markingPaidInvoice) return;
    updateMutation.mutate({
      id: markingPaidInvoice.id,
      data: {
        status: "paid",
        paid_at: payData.paid_at,
        payment_method: payData.payment_method,
        payment_notes: payData.payment_notes || null,
      },
    });
  }, [markingPaidInvoice, updateMutation]);

  const handleVoid = useCallback(() => {
    if (voidingId === null) return;
    updateMutation.mutate({ id: voidingId, data: { status: "void" } });
  }, [voidingId, updateMutation]);

  // Filtered & sorted invoices
  const filtered = invoices.filter(inv => {
    if (filterStatus === "paid" && inv.status !== "paid") return false;
    if (filterStatus === "unpaid" && inv.status !== "unpaid") return false;
    if (filterStatus === "void" && inv.status !== "void") return false;
    return true;
  }).sort((a, b) => {
    // sort: unpaid/overdue first, then paid, then void
    const order = (i: Invoice) => i.status === "void" ? 3 : i.status === "paid" ? 2 : 1;
    return order(a) - order(b);
  });

  // Summary (exclude void from totals)
  const activeInvoices = invoices.filter(i => i.status !== "void");
  const totalPaid = activeInvoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalUnpaid = activeInvoices.filter(i => i.status === "unpaid").reduce((s, i) => s + i.amount, 0);

  const getClientName = (id: number) => clients.find(c => c.id === id)?.name ?? `Client #${id}`;

  // ── Stripe payment ────────────────────────────────────────────────────────
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/stripe/config", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { enabled: boolean } | null) => { if (d?.enabled) setStripeEnabled(true); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const invoiceId = params.get("invoice");
    if (payment === "success" && invoiceId) {
      toast({ title: "Payment received!", description: `Invoice #${invoiceId} is now marked paid.` });
      invalidate();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (payment === "cancelled") {
      toast({ title: "Payment cancelled", description: "No charge was made." });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const payInvoice = async (inv: Invoice) => {
    if (payingId !== null) return;
    setPayingId(inv.id);
    try {
      const res = await fetch(`/api/stripe/checkout/${inv.id}`, {
        method: "POST", credentials: "include",
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Failed to start checkout");
      window.location.href = data.url;
    } catch (err: any) {
      toast({ title: "Payment failed", description: err.message, variant: "destructive" });
      setPayingId(null);
    }
  };

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
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Invoices</h1>
          <p className="text-slate-500 mt-1">Manage billing, payments, and outstanding balances.</p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setEditingInvoice(null); }}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-xl text-sm transition-colors shrink-0"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancel" : "New Invoice"}
        </button>
      </div>

      {/* ── Summary Cards ───────────────────────────────────────────────────── */}
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
            <p className="text-2xl font-bold text-slate-900">{activeInvoices.length}</p>
          </div>
        </div>
      </div>

      {/* ── New Invoice Form ─────────────────────────────────────────────────── */}
      {showForm && !editingInvoice && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6">
          <h2 className="font-semibold text-slate-900 mb-5">New Invoice</h2>
          <InvoiceForm
            clients={clients}
            services={services}
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
            isPending={createMutation.isPending}
          />
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
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
          {(["all", "unpaid", "paid", "void"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                "px-3 py-1.5 font-medium transition-colors capitalize",
                filterStatus === s ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {s === "all" ? "All" : s === "paid" ? "Paid" : s === "void" ? "Void" : "Unpaid"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Invoice List ─────────────────────────────────────────────────────── */}
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
              const isVoid = inv.status === "void";
              const isPaid = inv.status === "paid";

              return (
                <div
                  key={inv.id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 hover:bg-slate-50/60 transition-colors",
                    isVoid && "opacity-50"
                  )}
                >
                  {/* Amount + client */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("font-semibold text-slate-900", isVoid && "line-through")}>
                        {formatCurrency(inv.amount)}
                      </span>
                      <span className="text-slate-400 text-sm">·</span>
                      <span className="text-sm text-slate-600">{getClientName(inv.client_id)}</span>
                      <span className="text-slate-300 text-xs">#{inv.id}</span>
                      {inv.description && (
                        <>
                          <span className="text-slate-400 text-sm">·</span>
                          <span className="text-sm text-slate-500 truncate max-w-xs">{inv.description}</span>
                        </>
                      )}
                    </div>

                    {/* Line items summary */}
                    {inv.line_items && inv.line_items.length > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {inv.line_items.slice(0, 3).map(li => li.name).join(", ")}
                        {inv.line_items.length > 3 && ` +${inv.line_items.length - 3} more`}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn("text-xs", overdue ? "text-red-500 font-medium" : "text-slate-400")}>
                        {overdue ? "Overdue · " : "Due "}
                        {formatDate(inv.due_date)}
                      </span>
                      {isPaid && inv.paid_at && (
                        <span className="text-xs text-emerald-600">
                          · Paid {formatDate(inv.paid_at)}
                          {inv.payment_method && ` via ${PAYMENT_METHODS.find(m => m.value === inv.payment_method)?.label ?? inv.payment_method}`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span className={cn(
                    "shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border",
                    statusBadge(inv)
                  )}>
                    {statusLabel(inv)}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Mark paid */}
                    {!isPaid && !isVoid && (
                      <button
                        onClick={() => setMarkingPaidInvoice(inv)}
                        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        title="Record payment"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        Paid
                      </button>
                    )}

                    {/* Edit */}
                    {!isVoid && (
                      <button
                        onClick={() => { setEditingInvoice(inv); setShowForm(false); }}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                        title="Edit invoice"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}

                    {/* Pay via Stripe */}
                    {stripeEnabled && !isPaid && !isVoid && (
                      <button
                        onClick={() => payInvoice(inv)}
                        disabled={payingId === inv.id}
                        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                        title="Pay online via Stripe"
                      >
                        {payingId === inv.id ? (
                          <span className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin inline-block" />
                        ) : (
                          <CreditCard className="w-3.5 h-3.5" />
                        )}
                        Pay
                      </button>
                    )}

                    {/* PDF download */}
                    <button
                      onClick={() => downloadPdf(inv)}
                      disabled={downloadingId === inv.id}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-blue-500 transition-colors"
                      title="Download PDF"
                    >
                      {downloadingId === inv.id ? (
                        <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin inline-block" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>

                    {/* Void */}
                    {!isVoid && (
                      <button
                        onClick={() => setVoidingId(inv.id)}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition-colors"
                        title="Void invoice"
                      >
                        <BanIcon className="w-4 h-4" />
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      onClick={() => setDeleteConfirmId(inv.id)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete permanently"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Edit Invoice Modal ───────────────────────────────────────────────── */}
      <Modal
        isOpen={!!editingInvoice}
        onClose={() => setEditingInvoice(null)}
        title={`Edit Invoice #${editingInvoice?.id}`}
        description={editingInvoice ? `${getClientName(editingInvoice.client_id)} · ${formatCurrency(editingInvoice.amount)}` : undefined}
      >
        {editingInvoice && (
          <InvoiceForm
            invoice={editingInvoice}
            clients={clients}
            services={services}
            onSubmit={handleEdit}
            onCancel={() => setEditingInvoice(null)}
            isPending={updateMutation.isPending}
          />
        )}
      </Modal>

      {/* ── Mark as Paid Modal ──────────────────────────────────────────────── */}
      {markingPaidInvoice && (
        <MarkAsPaidModal
          invoice={markingPaidInvoice}
          onClose={() => setMarkingPaidInvoice(null)}
          onConfirm={handleMarkPaid}
          isPending={updateMutation.isPending}
        />
      )}

      {/* ── Void Confirmation Modal ─────────────────────────────────────────── */}
      <Modal
        isOpen={voidingId !== null}
        onClose={() => setVoidingId(null)}
        title="Void Invoice"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Mark this invoice as void?</p>
              <p className="text-xs text-amber-600 mt-1">
                The invoice will be kept on record but excluded from totals and reports. This cannot be undone.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleVoid}
              disabled={updateMutation.isPending}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {updateMutation.isPending ? "Voiding…" : "Void Invoice"}
            </button>
            <button
              onClick={() => setVoidingId(null)}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirmation Modal ───────────────────────────────────────── */}
      <Modal
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="Delete Invoice"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">Permanently delete this invoice?</p>
              <p className="text-xs text-red-600 mt-1">
                This action cannot be undone. The invoice record will be permanently removed.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => deleteConfirmId !== null && deleteMutation.mutate({ id: deleteConfirmId })}
              disabled={deleteMutation.isPending}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete Permanently"}
            </button>
            <button
              onClick={() => setDeleteConfirmId(null)}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

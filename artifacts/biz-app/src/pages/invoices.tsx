import React, { useState, useEffect, useCallback } from "react";
import {
  useListInvoices,
  useListClients,
  useListServices,
  useCreateInvoice,
  useUpdateInvoice,
  useDeleteInvoice,
  useSendInvoice,
  useSendReminder,
  useListInvoiceReminders,
  useListRecurringInvoices,
  useCreateRecurringInvoice,
  useUpdateRecurringInvoice,
  useDeleteRecurringInvoice,
  useGenerateRecurringInvoice,
  getListInvoicesQueryKey,
  getListRecurringInvoicesQueryKey,
  Invoice,
  LineItem,
  RecurringInvoice,
  InvoiceReminder,
  ReminderType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Modal } from "@/components/Modal";
import {
  Plus, X, Trash2, CheckCircle2, Clock, FileText, Download,
  CreditCard, Pencil, BanIcon, DollarSign, AlertTriangle,
  ChevronDown, ChevronUp, Send, RefreshCw, ToggleLeft, ToggleRight,
  Repeat, Play, Bell, BellRing,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type DraftItem = {
  _id: string;
  name: string;
  description: string;
  qty: number;
  unit_price: number;
};

type StatusFilter = "all" | "draft" | "sent" | "unpaid" | "paid" | "void" | "recurring";

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

const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom interval" },
];

const REMINDER_TYPES: { type: ReminderType; label: string; description: string; urgency: string }[] = [
  { type: "due", label: "Due Today", description: "Sent on the invoice due date.", urgency: "amber" },
  { type: "day3", label: "3 Days Overdue", description: "Sent 3 days after the due date.", urgency: "orange" },
  { type: "day5", label: "5 Days Overdue", description: "Sent 5 days overdue. Late fees begin tomorrow.", urgency: "red" },
  { type: "day10", label: "10 Days Overdue", description: "Sent 10 days overdue. Urgent notice.", urgency: "rose" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function todayStr() {
  return new Date().toISOString().split("T")[0]!;
}

function daysOverdue(due_date: string): number {
  const today = new Date(todayStr() + "T00:00:00");
  const due = new Date(due_date + "T00:00:00");
  return Math.floor((today.getTime() - due.getTime()) / 86_400_000);
}

function isOverdue(due_date: string, status: string) {
  if (status === "paid" || status === "void") return false;
  return due_date < todayStr();
}

function statusBadge(inv: Invoice) {
  if (inv.status === "void")   return "bg-slate-100 text-slate-500 border-slate-200";
  if (inv.status === "paid")   return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (inv.status === "draft")  return "bg-purple-50 text-purple-700 border-purple-200";
  if (inv.status === "sent")   return "bg-blue-50 text-blue-700 border-blue-200";
  if (isOverdue(inv.due_date, inv.status)) return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function statusLabel(inv: Invoice) {
  if (inv.status === "void")   return "Void";
  if (inv.status === "paid")   return "Paid";
  if (inv.status === "draft")  return "Draft";
  if (inv.status === "sent")   return "Sent";
  const days = daysOverdue(inv.due_date);
  if (days > 0) return `${days}d overdue`;
  return "Unpaid";
}

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white";

// ── Toggle div (avoids label + button double-click bug) ───────────────────────

function ToggleDiv({ value, onChange, label, sublabel }: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sublabel?: string;
}) {
  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onChange(!value)}
      onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!value); } }}
      className="flex items-center gap-2.5 cursor-pointer select-none"
      aria-pressed={value}>
      {value ? <ToggleRight className="w-6 h-6 text-blue-600 shrink-0" /> : <ToggleLeft className="w-6 h-6 text-slate-400 shrink-0" />}
      <span className="text-sm text-slate-600">
        <span className={cn("font-medium", value ? "text-blue-700" : "text-slate-700")}>{label}</span>
        {sublabel && <span className="text-slate-400 ml-1">{sublabel}</span>}
      </span>
    </div>
  );
}

// ── Line Items Editor ─────────────────────────────────────────────────────────

function LineItemsEditor({
  items, onChange, services,
}: {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  services: { id: number; name: string; description?: string | null; price: number; active: boolean }[];
}) {
  const [addServiceId, setAddServiceId] = useState("");

  const update = (id: string, field: keyof DraftItem, value: string | number) => {
    onChange(items.map(it => it._id === id ? { ...it, [field]: value } : it));
  };
  const remove = (id: string) => onChange(items.filter(it => it._id !== id));
  const addCustom = () => onChange([...items, newItem()]);
  const addFromService = () => {
    if (!addServiceId) return;
    const svc = services.find(s => String(s.id) === addServiceId);
    if (!svc) return;
    onChange([...items, newItem({ name: svc.name, description: svc.description ?? "", qty: 1, unit_price: svc.price })]);
    setAddServiceId("");
  };
  const activeServices = services.filter(s => s.active);

  return (
    <div className="space-y-3">
      {activeServices.length > 0 && (
        <div className="flex gap-2">
          <select className={cn(inputCls, "flex-1")} value={addServiceId} onChange={e => setAddServiceId(e.target.value)}>
            <option value="">Add from service catalog…</option>
            {activeServices.map(s => <option key={s.id} value={s.id}>{s.name} — {formatCurrency(s.price)}</option>)}
          </select>
          <button type="button" onClick={addFromService} disabled={!addServiceId}
            className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0">Add</button>
        </div>
      )}
      {items.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_3fr_2fr_1.5fr_1.5fr_auto] gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <span>Qty</span><span>Item</span><span>Description</span><span>Unit Price</span><span className="text-right">Total</span><span />
          </div>
          {items.map(it => (
            <div key={it._id} className="grid grid-cols-[1fr_3fr_2fr_1.5fr_1.5fr_auto] gap-2 px-3 py-2 border-b border-slate-100 last:border-0 items-center">
              <input type="number" min={0.01} step={0.01} value={it.qty}
                className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                onChange={e => update(it._id, "qty", Number(e.target.value))} />
              <input type="text" placeholder="Item name" value={it.name}
                className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                onChange={e => update(it._id, "name", e.target.value)} />
              <input type="text" placeholder="Description" value={it.description}
                className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                onChange={e => update(it._id, "description", e.target.value)} />
              <input type="number" min={0} step={0.01} placeholder="0.00" value={it.unit_price}
                className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                onChange={e => update(it._id, "unit_price", Number(e.target.value))} />
              <span className="text-right text-sm font-medium text-slate-700">{formatCurrency(it.qty * it.unit_price)}</span>
              <button type="button" onClick={() => remove(it._id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <div className="flex justify-end px-3 py-2 bg-slate-50 border-t border-slate-200">
            <span className="text-sm font-bold text-slate-900">Total: {formatCurrency(calcTotal(items))}</span>
          </div>
        </div>
      )}
      <button type="button" onClick={addCustom}
        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
        <Plus className="w-3.5 h-3.5" /> Add custom line item
      </button>
    </div>
  );
}

// ── Invoice Form ──────────────────────────────────────────────────────────────

function InvoiceForm({ invoice, clients, services, onSubmit, onCancel, isPending }: {
  invoice?: Invoice;
  clients: { id: number; name: string }[];
  services: { id: number; name: string; description?: string | null; price: number; active: boolean }[];
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const isEdit = !!invoice;
  const [clientId, setClientId] = useState(invoice ? String(invoice.client_id) : "");
  const [dueDate, setDueDate] = useState(invoice?.due_date ?? "");
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [thankYou, setThankYou] = useState(invoice?.thank_you_message ?? "");
  const [description, setDescription] = useState(invoice?.description ?? "");
  const [saveAsDraft, setSaveAsDraft] = useState(invoice?.status === "draft");
  const [manualAmount, setManualAmount] = useState<string>(
    invoice && (!invoice.line_items || invoice.line_items.length === 0) ? String(invoice.amount) : ""
  );
  const [lineItems, setLineItems] = useState<DraftItem[]>(
    invoice?.line_items?.map(li => ({ _id: Math.random().toString(36).slice(2), name: li.name, description: li.description ?? "", qty: li.qty, unit_price: li.unit_price })) ?? []
  );
  const [showAdvanced, setShowAdvanced] = useState(!!(invoice?.notes || invoice?.thank_you_message));

  const hasItems = lineItems.length > 0;
  const total = hasItems ? calcTotal(lineItems) : Number(manualAmount) || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !dueDate) return;
    if (!hasItems && !manualAmount) return;
    const currentStatus = isEdit
      ? (saveAsDraft ? "draft" : invoice?.status === "draft" ? "unpaid" : invoice?.status ?? "unpaid")
      : (saveAsDraft ? "draft" : "unpaid");
    onSubmit({ client_id: Number(clientId), amount: total, due_date: dueDate, status: currentStatus, description: description.trim() || null, line_items: hasItems ? lineItems.map(draftToLineItem) : null, notes: notes.trim() || null, thank_you_message: thankYou.trim() || null });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Client <span className="text-red-400">*</span></label>
          <select className={inputCls} value={clientId} onChange={e => setClientId(e.target.value)} required disabled={isEdit}>
            <option value="">Select a client…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Due Date <span className="text-red-400">*</span></label>
          <input type="date" className={inputCls} value={dueDate} onChange={e => setDueDate(e.target.value)} required />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-2">Line Items {hasItems && <span className="text-blue-500">({lineItems.length})</span>}</label>
        <LineItemsEditor items={lineItems} onChange={setLineItems} services={services} />
      </div>
      {!hasItems && (
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Total Amount ($) <span className="text-red-400">*</span></label>
          <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={manualAmount} onChange={e => setManualAmount(e.target.value)} required={!hasItems} />
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Description / Memo</label>
        <input type="text" className={inputCls} placeholder="e.g. March bookkeeping services" value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <button type="button" onClick={() => setShowAdvanced(v => !v)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
        {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {showAdvanced ? "Hide" : "Show"} notes & thank-you message
      </button>
      {showAdvanced && (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Notes (internal / terms)</label>
            <textarea className={cn(inputCls, "resize-none")} rows={2} placeholder="e.g. Payment due net 15." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Thank-you Message</label>
            <textarea className={cn(inputCls, "resize-none")} rows={2} placeholder="e.g. Thank you for your business!" value={thankYou} onChange={e => setThankYou(e.target.value)} />
          </div>
        </div>
      )}
      <ToggleDiv value={saveAsDraft} onChange={setSaveAsDraft} label="Save as Draft" sublabel="(don't send yet)" />
      {total > 0 && (
        <div className="flex justify-end">
          <div className="bg-slate-900 text-white rounded-xl px-5 py-3 text-right">
            <p className="text-xs text-slate-400 mb-0.5">Invoice Total</p>
            <p className="text-xl font-bold">{formatCurrency(total)}</p>
          </div>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
          {isPending ? (isEdit ? "Saving…" : "Creating…") : (isEdit ? "Save Changes" : saveAsDraft ? "Save Draft" : "Create Invoice")}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-900 px-4 py-2 rounded-lg border border-slate-200 transition-colors">Cancel</button>
      </div>
    </form>
  );
}

// ── Mark as Paid Modal ────────────────────────────────────────────────────────

function MarkAsPaidModal({ invoice, onClose, onConfirm, isPending }: {
  invoice: Invoice; onClose: () => void;
  onConfirm: (data: { paid_at: string; payment_method: string; payment_notes: string }) => void;
  isPending: boolean;
}) {
  const [paidAt, setPaidAt] = useState(todayStr());
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  return (
    <Modal isOpen title="Record Payment" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); onConfirm({ paid_at: paidAt, payment_method: method, payment_notes: notes }); }} className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
          <DollarSign className="w-5 h-5 text-emerald-600 shrink-0" />
          <div><p className="text-sm font-semibold text-emerald-800">Invoice #{invoice.id}</p><p className="text-xs text-emerald-600">{formatCurrency(invoice.amount)}</p></div>
        </div>
        <div><label className="block text-xs font-medium text-slate-500 mb-1">Payment Date</label><input type="date" className={inputCls} value={paidAt} onChange={e => setPaidAt(e.target.value)} required /></div>
        <div><label className="block text-xs font-medium text-slate-500 mb-1">Payment Method</label>
          <select className={inputCls} value={method} onChange={e => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div><label className="block text-xs font-medium text-slate-500 mb-1">Notes (optional)</label><textarea className={cn(inputCls, "resize-none")} rows={2} placeholder="e.g. Check #1234" value={notes} onChange={e => setNotes(e.target.value)} /></div>
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={isPending} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50">{isPending ? "Saving…" : "Mark as Paid"}</button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Reminder Modal ────────────────────────────────────────────────────────────

function ReminderModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: reminders = [], isLoading, refetch } = useListInvoiceReminders(invoice.id);

  const sendMutation = useSendReminder({
    mutation: {
      onSuccess: (_, vars) => {
        refetch();
        const label = REMINDER_TYPES.find(r => r.type === vars.data.type)?.label ?? vars.data.type;
        toast({ title: `Reminder sent: ${label}` });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? err?.message ?? "Failed to send reminder";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const sentTypes = new Set(reminders.map(r => r.type));
  const overdueDays = daysOverdue(invoice.due_date);

  return (
    <Modal isOpen title={`Reminders — Invoice #${invoice.id}`} onClose={onClose}
      description={`${formatCurrency(invoice.amount)} · Due ${formatDate(invoice.due_date)}${overdueDays > 0 ? ` · ${overdueDays}d overdue` : ""}`}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          Reminders are sent automatically each day at midnight. You can also trigger them manually below.
        </p>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-14 rounded-xl bg-slate-50 animate-pulse" />)}</div>
        ) : (
          <div className="space-y-2">
            {REMINDER_TYPES.map(({ type, label, description }) => {
              const alreadySent = sentTypes.has(type);
              const sentRecord = reminders.find(r => r.type === type);
              const isSending = sendMutation.isPending && sendMutation.variables?.data.type === type;
              return (
                <div key={type} className={cn(
                  "flex items-center justify-between gap-3 p-3 rounded-xl border",
                  alreadySent ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"
                )}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{label}</p>
                    <p className="text-xs text-slate-500">{description}</p>
                    {sentRecord && (
                      <p className="text-xs text-emerald-600 mt-0.5">
                        Sent {new Date(sentRecord.sent_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {alreadySent && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    <button
                      onClick={() => sendMutation.mutate({ id: invoice.id, data: { type } })}
                      disabled={isSending}
                      className={cn(
                        "text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50",
                        alreadySent
                          ? "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      )}>
                      {isSending ? (
                        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
                      ) : alreadySent ? "Resend" : "Send"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button onClick={onClose} className="w-full mt-2 px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Close</button>
      </div>
    </Modal>
  );
}

// ── Recurring Invoice Form ────────────────────────────────────────────────────

function RecurringInvoiceForm({ clients, services, onSubmit, onCancel, isPending }: {
  clients: { id: number; name: string }[];
  services: { id: number; name: string; description?: string | null; price: number; active: boolean }[];
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [clientId, setClientId] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "monthly" | "custom">("monthly");
  const [intervalDays, setIntervalDays] = useState(30);
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [lineItems, setLineItems] = useState<DraftItem[]>([]);
  const [manualAmount, setManualAmount] = useState("");
  const [autoSend, setAutoSend] = useState(false);

  const hasItems = lineItems.length > 0;
  const total = hasItems ? calcTotal(lineItems) : Number(manualAmount) || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !startDate || total === 0) return;
    onSubmit({
      client_id: Number(clientId), frequency,
      interval_days: frequency === "custom" ? intervalDays : null,
      start_date: startDate, end_date: endDate || null,
      next_due_date: startDate, description: description.trim() || null,
      line_items: hasItems ? lineItems.map(draftToLineItem) : null,
      notes: null, thank_you_message: null,
      amount: total, auto_send: autoSend,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Client <span className="text-red-400">*</span></label>
          <select className={inputCls} value={clientId} onChange={e => setClientId(e.target.value)} required>
            <option value="">Select a client…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Frequency <span className="text-red-400">*</span></label>
          <select className={inputCls} value={frequency} onChange={e => setFrequency(e.target.value as any)}>
            {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>
      {frequency === "custom" && (
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Repeat every (days)</label>
          <input type="number" min={1} className={inputCls} value={intervalDays} onChange={e => setIntervalDays(Number(e.target.value))} />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Start Date <span className="text-red-400">*</span></label>
          <input type="date" className={inputCls} value={startDate} onChange={e => setStartDate(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">End Date (optional)</label>
          <input type="date" className={inputCls} value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
        <input type="text" className={inputCls} placeholder="e.g. Monthly bookkeeping" value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-2">Line Items</label>
        <LineItemsEditor items={lineItems} onChange={setLineItems} services={services} />
      </div>
      {!hasItems && (
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Amount ($) <span className="text-red-400">*</span></label>
          <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={manualAmount} onChange={e => setManualAmount(e.target.value)} required={!hasItems} />
        </div>
      )}
      <div className="border-t border-slate-100 pt-4 space-y-2">
        <ToggleDiv value={autoSend} onChange={setAutoSend} label="Auto-send to client" sublabel="(email sent automatically when each invoice generates)" />
      </div>
      {total > 0 && (
        <div className="flex justify-end">
          <div className="bg-slate-900 text-white rounded-xl px-5 py-3 text-right">
            <p className="text-xs text-slate-400 mb-0.5">Invoice Amount</p>
            <p className="text-xl font-bold">{formatCurrency(total)}</p>
          </div>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
          {isPending ? "Creating…" : "Create Recurring Invoice"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-900 px-4 py-2 rounded-lg border border-slate-200 transition-colors">Cancel</button>
      </div>
    </form>
  );
}

// ── Recurring Invoices Panel ──────────────────────────────────────────────────

function RecurringInvoicesPanel({ clients, services }: {
  clients: { id: number; name: string }[];
  services: { id: number; name: string; description?: string | null; price: number; active: boolean }[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  const { data: recurring = [], isLoading } = useListRecurringInvoices();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListRecurringInvoicesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
  };

  const createMutation = useCreateRecurringInvoice({
    mutation: {
      onSuccess: () => { invalidate(); setShowForm(false); toast({ title: "Recurring schedule created" }); },
      onError: () => toast({ title: "Failed to create", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateRecurringInvoice({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Updated" }); },
      onError: () => toast({ title: "Failed to update", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteRecurringInvoice({
    mutation: {
      onSuccess: () => { invalidate(); setDeleteId(null); toast({ title: "Schedule deleted" }); },
      onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
    },
  });

  const generateMutation = useGenerateRecurringInvoice({
    mutation: {
      onSuccess: (inv) => { invalidate(); setGeneratingId(null); toast({ title: `Invoice #${inv.id} generated`, description: formatCurrency(inv.amount) }); },
      onError: () => { setGeneratingId(null); toast({ title: "Failed to generate", variant: "destructive" }); },
    },
  });

  const getClientName = (id: number) => clients.find(c => c.id === id)?.name ?? `Client #${id}`;
  const toggle = (r: RecurringInvoice, field: "active" | "auto_send") => {
    updateMutation.mutate({ id: r.id, data: { [field]: !r[field] } });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">Recurring Invoices</h2>
          <p className="text-sm text-slate-500 mt-0.5">Schedules auto-generate invoices daily. Auto-send emails them straight to the client.</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancel" : "New Schedule"}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-blue-200 p-6">
          <RecurringInvoiceForm clients={clients} services={services}
            onSubmit={(data) => createMutation.mutate({ data })}
            onCancel={() => setShowForm(false)}
            isPending={createMutation.isPending} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-16 bg-white rounded-xl border border-slate-100 animate-pulse" />)}</div>
      ) : recurring.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
          <Repeat className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No recurring schedules yet</p>
          <p className="text-slate-400 text-sm mt-1">Create a schedule to auto-generate invoices on a set frequency.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {recurring.map(r => (
              <div key={r.id} className={cn("px-5 py-4 hover:bg-slate-50/60 transition-colors", !r.active && "opacity-50")}>
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{formatCurrency(r.amount)}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-sm text-slate-600">{getClientName(r.client_id)}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 capitalize">{r.frequency}</span>
                      {!r.active && <span className="text-xs text-slate-400 font-medium">Paused</span>}
                      {r.auto_send && <span className="text-xs px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">Auto-send</span>}
                    </div>
                    {r.description && <p className="text-sm text-slate-500 mt-0.5">{r.description}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-slate-400">
                      <span>Next: <span className="font-medium text-slate-600">{formatDate(r.next_due_date)}</span></span>
                      {r.end_date && <span>· Ends: {formatDate(r.end_date)}</span>}
                      {r.line_items && r.line_items.length > 0 && <span>· {r.line_items.length} line item{r.line_items.length !== 1 ? "s" : ""}</span>}
                    </div>
                    {/* Toggles inline */}
                    <div className="flex flex-wrap gap-4 mt-2">
                      <div
                        role="button" tabIndex={0}
                        onClick={() => toggle(r, "active")}
                        onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(r, "active"); } }}
                        className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-slate-500 hover:text-slate-700">
                        {r.active ? <ToggleRight className="w-4 h-4 text-blue-500" /> : <ToggleLeft className="w-4 h-4" />}
                        {r.active ? "Active" : "Paused"}
                      </div>
                      <div
                        role="button" tabIndex={0}
                        onClick={() => toggle(r, "auto_send")}
                        onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(r, "auto_send"); } }}
                        className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-slate-500 hover:text-slate-700">
                        {r.auto_send ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4" />}
                        Auto-send
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => { setGeneratingId(r.id); generateMutation.mutate({ id: r.id }); }}
                      disabled={!r.active || generatingId === r.id}
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 transition-colors">
                      {generatingId === r.id ? <span className="w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin inline-block" /> : <Play className="w-3.5 h-3.5" />}
                      Generate
                    </button>
                    <button onClick={() => setDeleteId(r.id)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Recurring Schedule">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div><p className="text-sm font-semibold text-red-800">Delete this schedule?</p><p className="text-xs text-red-600 mt-1">Existing invoices are kept. No future invoices will be generated.</p></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => deleteId !== null && deleteMutation.mutate({ id: deleteId })} disabled={deleteMutation.isPending}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
              {deleteMutation.isPending ? "Deleting…" : "Delete Schedule"}
            </button>
            <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Main Invoices Page ────────────────────────────────────────────────────────

export default function Invoices() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [filterClient, setFilterClient] = useState<number | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [markingPaidInvoice, setMarkingPaidInvoice] = useState<Invoice | null>(null);
  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [reminderInvoice, setReminderInvoice] = useState<Invoice | null>(null);

  const { data: invoices = [], isLoading } = useListInvoices(filterClient ? { clientId: filterClient } : undefined);
  const { data: clients = [] } = useListClients();
  const { data: services = [] } = useListServices();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });

  const createMutation = useCreateInvoice({
    mutation: {
      onSuccess: () => { invalidate(); setShowForm(false); toast({ title: "Invoice created" }); },
      onError: () => toast({ title: "Failed to create invoice", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateInvoice({
    mutation: {
      onSuccess: () => {
        invalidate();
        setEditingInvoice(null); setMarkingPaidInvoice(null);
        setVoidingId(null); setSendingId(null);
        toast({ title: "Invoice updated" });
      },
      onError: () => toast({ title: "Failed to update invoice", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteInvoice({
    mutation: {
      onSuccess: () => { invalidate(); setDeleteConfirmId(null); toast({ title: "Invoice deleted" }); },
      onError: () => toast({ title: "Failed to delete invoice", variant: "destructive" }),
    },
  });

  const sendMutation = useSendInvoice({
    mutation: {
      onSuccess: (data: any) => {
        invalidate(); setSendingId(null);
        toast({
          title: data?.emailSent !== false ? "Invoice sent!" : "Invoice marked as sent",
          description: data?.emailSent !== false ? "Email delivered to client." : "SMTP not configured — status updated.",
        });
      },
      onError: () => { setSendingId(null); toast({ title: "Failed to send invoice", variant: "destructive" }); },
    },
  });

  const filtered = invoices
    .filter(inv => {
      if (filterStatus === "recurring") return false;
      if (filterStatus !== "all" && inv.status !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      const order = (i: Invoice) => i.status === "void" ? 5 : i.status === "paid" ? 4 : i.status === "sent" ? 3 : i.status === "draft" ? 2 : 1;
      return order(a) - order(b);
    });

  const activeInvoices = invoices.filter(i => i.status !== "void");
  const totalPaid = activeInvoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalUnpaid = activeInvoices.filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
  const overdueCount = activeInvoices.filter(i => isOverdue(i.due_date, i.status)).length;

  const getClientName = (id: number) => clients.find(c => c.id === id)?.name ?? `Client #${id}`;

  // Stripe
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
    if (params.get("payment") === "success") {
      toast({ title: "Payment received!", description: `Invoice #${params.get("invoice")} marked paid.` });
      invalidate();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("payment") === "cancelled") {
      toast({ title: "Payment cancelled", description: "No charge was made." });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const payInvoice = async (inv: Invoice) => {
    if (payingId !== null) return;
    setPayingId(inv.id);
    try {
      const res = await fetch(`/api/stripe/checkout/${inv.id}`, { method: "POST", credentials: "include" });
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
      const a = document.createElement("a"); a.href = url; a.download = `invoice-${inv.id}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast({ title: "Failed to download PDF", variant: "destructive" }); }
    finally { setDownloadingId(null); }
  };

  const STATUS_TABS: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "draft", label: "Draft" },
    { value: "sent", label: "Sent" },
    { value: "unpaid", label: "Unpaid" },
    { value: "paid", label: "Paid" },
    { value: "void", label: "Void" },
    { value: "recurring", label: "Recurring" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Invoices</h1>
          <p className="text-slate-500 mt-1">Manage billing, payments, and outstanding balances.</p>
        </div>
        {filterStatus !== "recurring" && (
          <button onClick={() => { setShowForm(v => !v); setEditingInvoice(null); }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-xl text-sm transition-colors shrink-0">
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? "Cancel" : "New Invoice"}
          </button>
        )}
      </div>

      {/* Summary Cards */}
      {filterStatus !== "recurring" && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0"><CheckCircle2 className="w-5 h-5" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Paid</p><p className="text-2xl font-bold text-slate-900">{formatCurrency(totalPaid)}</p></div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0"><Clock className="w-5 h-5" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Outstanding</p><p className="text-2xl font-bold text-slate-900">{formatCurrency(totalUnpaid)}</p></div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0"><FileText className="w-5 h-5" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">All Invoices</p><p className="text-2xl font-bold text-slate-900">{activeInvoices.length}</p></div>
          </div>
          <div className={cn("bg-white rounded-2xl border shadow-sm p-5 flex items-center gap-4", overdueCount > 0 ? "border-red-200" : "border-slate-200")}>
            <div className={cn("p-3 rounded-xl shrink-0", overdueCount > 0 ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-400")}><BellRing className="w-5 h-5" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Overdue</p><p className={cn("text-2xl font-bold", overdueCount > 0 ? "text-red-600" : "text-slate-900")}>{overdueCount}</p></div>
          </div>
        </div>
      )}

      {/* New Invoice Form */}
      {showForm && !editingInvoice && filterStatus !== "recurring" && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6">
          <h2 className="font-semibold text-slate-900 mb-5">New Invoice</h2>
          <InvoiceForm clients={clients} services={services} onSubmit={(data) => createMutation.mutate({ data })} onCancel={() => setShowForm(false)} isPending={createMutation.isPending} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {filterStatus !== "recurring" && (
          <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterClient ?? ""} onChange={e => setFilterClient(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
          {STATUS_TABS.map(tab => (
            <button key={tab.value} onClick={() => setFilterStatus(tab.value)}
              className={cn("px-3 py-1.5 font-medium transition-colors", tab.value === "recurring" && "flex items-center gap-1",
                filterStatus === tab.value ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>
              {tab.value === "recurring" && <Repeat className="w-3 h-3" />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Recurring Panel */}
      {filterStatus === "recurring" && <RecurringInvoicesPanel clients={clients} services={services} />}

      {/* Invoice List */}
      {filterStatus !== "recurring" && (
        isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-xl border border-slate-100 animate-pulse" />)}</div>
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
                const over = isOverdue(inv.due_date, inv.status);
                const overDays = over ? daysOverdue(inv.due_date) : 0;
                const isVoid = inv.status === "void";
                const isPaid = inv.status === "paid";
                const isSent = inv.status === "sent";
                const isRecurring = !!inv.recurring_id;

                return (
                  <div key={inv.id} className={cn("flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 hover:bg-slate-50/60 transition-colors", isVoid && "opacity-50")}>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("font-semibold text-slate-900", isVoid && "line-through")}>{formatCurrency(inv.amount)}</span>
                        <span className="text-slate-400 text-sm">·</span>
                        <span className="text-sm text-slate-600">{getClientName(inv.client_id)}</span>
                        <span className="text-slate-300 text-xs">#{inv.id}</span>
                        {isRecurring && <span className="flex items-center gap-1 text-xs text-blue-500 font-medium"><Repeat className="w-3 h-3" /> recurring</span>}
                        {inv.description && <><span className="text-slate-400 text-sm">·</span><span className="text-sm text-slate-500 truncate max-w-xs">{inv.description}</span></>}
                      </div>
                      {inv.line_items && inv.line_items.length > 0 && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {inv.line_items.slice(0, 3).map(li => li.name).join(", ")}
                          {inv.line_items.length > 3 && ` +${inv.line_items.length - 3} more`}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn("text-xs", over ? "text-red-500 font-medium" : "text-slate-400")}>
                          {over ? `${overDays}d overdue · Due ` : "Due "}{formatDate(inv.due_date)}
                        </span>
                        {isPaid && inv.paid_at && (
                          <span className="text-xs text-emerald-600">
                            · Paid {formatDate(inv.paid_at)}
                            {inv.payment_method && ` via ${PAYMENT_METHODS.find(m => m.value === inv.payment_method)?.label ?? inv.payment_method}`}
                          </span>
                        )}
                      </div>
                    </div>

                    <span className={cn("shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border", statusBadge(inv))}>{statusLabel(inv)}</span>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Mark paid */}
                      {!isPaid && !isVoid && (
                        <button onClick={() => setMarkingPaidInvoice(inv)}
                          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                          <DollarSign className="w-3.5 h-3.5" /> Paid
                        </button>
                      )}

                      {/* Send */}
                      {!isVoid && !isPaid && (
                        <button onClick={() => { setSendingId(inv.id); sendMutation.mutate({ id: inv.id }); }}
                          disabled={sendingId === inv.id}
                          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors">
                          {sendingId === inv.id ? <span className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin inline-block" /> : <Send className="w-3.5 h-3.5" />}
                          {isSent ? "Resend" : "Send"}
                        </button>
                      )}

                      {/* Reminders (bell — overdue or sent) */}
                      {!isVoid && !isPaid && (
                        <button onClick={() => setReminderInvoice(inv)} title="Send payment reminder"
                          className={cn("p-1.5 rounded-lg transition-colors", over ? "text-red-400 hover:text-red-600 hover:bg-red-50" : "text-slate-300 hover:text-amber-500 hover:bg-amber-50")}>
                          <Bell className="w-4 h-4" />
                        </button>
                      )}

                      {/* Edit */}
                      {!isVoid && (
                        <button onClick={() => { setEditingInvoice(inv); setShowForm(false); }}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit invoice">
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}

                      {/* Stripe */}
                      {stripeEnabled && !isPaid && !isVoid && (
                        <button onClick={() => payInvoice(inv)} disabled={payingId === inv.id}
                          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors">
                          {payingId === inv.id ? <span className="w-3 h-3 border-2 border-slate-600 border-t-transparent rounded-full animate-spin inline-block" /> : <CreditCard className="w-3.5 h-3.5" />}
                          Stripe
                        </button>
                      )}

                      {/* PDF */}
                      <button onClick={() => downloadPdf(inv)} disabled={downloadingId === inv.id}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-blue-500 transition-colors" title="Download PDF">
                        {downloadingId === inv.id ? <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin inline-block" /> : <Download className="w-4 h-4" />}
                      </button>

                      {/* Void */}
                      {!isVoid && (
                        <button onClick={() => setVoidingId(inv.id)}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Void invoice">
                          <BanIcon className="w-4 h-4" />
                        </button>
                      )}

                      {/* Delete */}
                      <button onClick={() => setDeleteConfirmId(inv.id)}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete permanently">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* Edit Invoice Modal */}
      <Modal isOpen={!!editingInvoice} onClose={() => setEditingInvoice(null)}
        title={`Edit Invoice #${editingInvoice?.id}`}
        description={editingInvoice ? `${getClientName(editingInvoice.client_id)} · ${formatCurrency(editingInvoice.amount)}` : undefined}>
        {editingInvoice && (
          <InvoiceForm invoice={editingInvoice} clients={clients} services={services}
            onSubmit={(data) => updateMutation.mutate({ id: editingInvoice.id, data })}
            onCancel={() => setEditingInvoice(null)} isPending={updateMutation.isPending} />
        )}
      </Modal>

      {/* Mark as Paid Modal */}
      {markingPaidInvoice && (
        <MarkAsPaidModal invoice={markingPaidInvoice} onClose={() => setMarkingPaidInvoice(null)}
          onConfirm={(payData) => updateMutation.mutate({ id: markingPaidInvoice.id, data: { status: "paid", paid_at: payData.paid_at, payment_method: payData.payment_method, payment_notes: payData.payment_notes || null } })}
          isPending={updateMutation.isPending} />
      )}

      {/* Reminders Modal */}
      {reminderInvoice && <ReminderModal invoice={reminderInvoice} onClose={() => setReminderInvoice(null)} />}

      {/* Void Confirmation */}
      <Modal isOpen={voidingId !== null} onClose={() => setVoidingId(null)} title="Void Invoice">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div><p className="text-sm font-semibold text-amber-800">Mark this invoice as void?</p><p className="text-xs text-amber-600 mt-1">The record is kept but excluded from totals and reports.</p></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => voidingId !== null && updateMutation.mutate({ id: voidingId, data: { status: "void" } })} disabled={updateMutation.isPending}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
              {updateMutation.isPending ? "Voiding…" : "Void Invoice"}
            </button>
            <button onClick={() => setVoidingId(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={deleteConfirmId !== null} onClose={() => setDeleteConfirmId(null)} title="Delete Invoice">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div><p className="text-sm font-semibold text-red-800">Permanently delete this invoice?</p><p className="text-xs text-red-600 mt-1">This action cannot be undone.</p></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => deleteConfirmId !== null && deleteMutation.mutate({ id: deleteConfirmId })} disabled={deleteMutation.isPending}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
              {deleteMutation.isPending ? "Deleting…" : "Delete Permanently"}
            </button>
            <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

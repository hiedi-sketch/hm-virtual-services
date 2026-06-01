import { useState, useEffect, useCallback } from "react";
import { useListClients } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Filter, DollarSign, Clock, CheckCircle2, AlertTriangle,
  ChevronDown, X, Pencil, Trash2, Send, Check, Ban,
  RotateCcw, CalendarClock, Paperclip, ExternalLink, Eye,
} from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

type BillStatus =
  | "upcoming" | "due_soon" | "sent_for_approval"
  | "approved" | "snoozed" | "rejected" | "paid";

interface ApBill {
  id: number;
  client_id: number;
  client_name?: string | null;
  vendor: string;
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date: string;
  amount: number;
  category?: string | null;
  status: BillStatus;
  notes?: string | null;
  attachment_url?: string | null;
  snooze_until?: string | null;
  client_response_note?: string | null;
  created_at?: string | null;
}

interface ApSettings {
  client_id: number;
  cycle_window_days: number;
  payment_day: string;
  approval_send_day: string;
  snooze_auto: boolean;
}

const STATUS_CONFIG: Record<BillStatus, { label: string; bg: string; text: string; dot: string }> = {
  upcoming:            { label: "Upcoming",           bg: "bg-slate-100",   text: "text-slate-600",  dot: "bg-slate-400" },
  due_soon:            { label: "Due Soon",           bg: "bg-amber-100",   text: "text-amber-700",  dot: "bg-amber-500" },
  sent_for_approval:   { label: "Sent for Approval",  bg: "bg-blue-100",    text: "text-blue-700",   dot: "bg-blue-500" },
  approved:            { label: "Approved",           bg: "bg-green-100",   text: "text-green-700",  dot: "bg-green-500" },
  snoozed:             { label: "Snoozed",            bg: "bg-purple-100",  text: "text-purple-700", dot: "bg-purple-500" },
  rejected:            { label: "Rejected",           bg: "bg-red-100",     text: "text-red-600",    dot: "bg-red-500" },
  paid:                { label: "Paid",               bg: "bg-slate-200",   text: "text-slate-500",  dot: "bg-slate-400" },
};

const ALL_STATUSES: BillStatus[] = ["upcoming", "due_soon", "sent_for_approval", "approved", "snoozed", "rejected", "paid"];

const EXPENSE_CATEGORIES = [
  "Rent / Lease", "Utilities", "Payroll", "Office Supplies", "Software / SaaS",
  "Professional Services", "Insurance", "Marketing / Advertising", "Equipment",
  "Meals & Entertainment", "Travel", "Bank Fees", "Legal / Accounting",
  "Maintenance / Repairs", "Taxes & Licenses", "Subscriptions", "Other",
];

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

function dueDateClass(dueDate: string, status: BillStatus) {
  if (status === "paid" || status === "snoozed") return "text-slate-500";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  const diff = (due.getTime() - today.getTime()) / 86400000;
  if (diff < 0) return "text-red-600 font-semibold";
  if (diff <= 7) return "text-amber-600 font-semibold";
  return "text-slate-700";
}

function StatusBadge({ status }: { status: BillStatus }) {
  const c = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

const EMPTY_BILL = {
  client_id: 0, vendor: "", invoice_number: "", invoice_date: "",
  due_date: "", amount: "", category: "", notes: "", attachment_url: "",
};

export default function ApQueue() {
  const { toast } = useToast();
  const { data: clients = [] } = useListClients();

  const [bills, setBills] = useState<ApBill[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [filterClient, setFilterClient] = useState<number | "all">("all");
  const [filterStatus, setFilterStatus] = useState<BillStatus | "all">("all");

  // modals
  const [billModal, setBillModal] = useState<null | "add" | ApBill>(null);
  const [rejectModal, setRejectModal] = useState<ApBill | null>(null);
  const [snoozeModal, setSnoozeModal] = useState<ApBill | null>(null);
  const [noteViewModal, setNoteViewModal] = useState<ApBill | null>(null);
  const [settingsModal, setSettingsModal] = useState<number | null>(null); // client_id

  const [rejectNote, setRejectNote] = useState("");
  const [snoozeDate, setSnoozeDate] = useState("");
  const [snoozeManual, setSnoozeManual] = useState(false);
  const [settings, setSettings] = useState<ApSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState<Partial<ApSettings>>({});
  const [billForm, setBillForm] = useState<typeof EMPTY_BILL>({ ...EMPTY_BILL });
  const [saving, setSaving] = useState(false);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterClient !== "all") params.set("client_id", String(filterClient));
      if (filterStatus !== "all") params.set("status", filterStatus);
      const res = await fetch(`${API}/api/ap/bills?${params}`);
      if (!res.ok) throw new Error("Failed to load bills");
      const data = await res.json();
      setBills(data);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [filterClient, filterStatus, toast]);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  // Summary stats (always over all bills, not filtered)
  const [allBills, setAllBills] = useState<ApBill[]>([]);
  useEffect(() => {
    fetch(`${API}/api/ap/bills`)
      .then(r => r.json())
      .then(d => setAllBills(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [bills]); // refresh when bills change

  const totalOutstanding = allBills.filter(b => b.status !== "paid").reduce((s, b) => s + b.amount, 0);
  const dueSoonBills = allBills.filter(b => b.status === "due_soon");
  const awaitingBills = allBills.filter(b => b.status === "sent_for_approval");
  const approvedBills = allBills.filter(b => b.status === "approved");

  async function patchBill(id: number, patch: Record<string, unknown>) {
    const res = await fetch(`${API}/api/ap/bills/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error("Update failed");
    return res.json();
  }

  async function setStatus(bill: ApBill, status: BillStatus, extra?: Record<string, unknown>) {
    try {
      await patchBill(bill.id, { status, ...extra });
      toast({ title: "Updated", description: `Bill marked as ${STATUS_CONFIG[status].label}` });
      fetchBills();
    } catch {
      toast({ title: "Error", description: "Could not update status", variant: "destructive" });
    }
  }

  async function deleteBill(id: number) {
    if (!confirm("Delete this bill permanently?")) return;
    await fetch(`${API}/api/ap/bills/${id}`, { method: "DELETE" });
    toast({ title: "Deleted" });
    fetchBills();
  }

  async function submitBillForm() {
    if (!billForm.vendor.trim()) return toast({ title: "Vendor is required", variant: "destructive" });
    if (!billForm.due_date) return toast({ title: "Due date is required", variant: "destructive" });
    if (!billForm.amount || isNaN(Number(billForm.amount))) return toast({ title: "Valid amount required", variant: "destructive" });
    if (!billForm.client_id) return toast({ title: "Select a client", variant: "destructive" });

    setSaving(true);
    try {
      const payload = {
        client_id: Number(billForm.client_id),
        vendor: billForm.vendor,
        invoice_number: billForm.invoice_number || null,
        invoice_date: billForm.invoice_date || null,
        due_date: billForm.due_date,
        amount: Number(billForm.amount),
        category: billForm.category || null,
        notes: billForm.notes || null,
        attachment_url: billForm.attachment_url || null,
      };

      if (billModal === "add") {
        await fetch(`${API}/api/ap/bills`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast({ title: "Bill added" });
      } else {
        await patchBill((billModal as ApBill).id, payload);
        toast({ title: "Bill updated" });
      }
      setBillModal(null);
      fetchBills();
    } catch {
      toast({ title: "Error saving bill", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function submitReject() {
    if (!rejectNote.trim()) return toast({ title: "A rejection note is required", variant: "destructive" });
    if (!rejectModal) return;
    await setStatus(rejectModal, "rejected", { client_response_note: rejectNote });
    setRejectModal(null);
    setRejectNote("");
  }

  async function submitSnooze() {
    if (!snoozeModal) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/ap/bills/${snoozeModal.id}/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snooze_until: snoozeDate || undefined, manual: snoozeManual }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Bill snoozed" });
      setSnoozeModal(null);
      fetchBills();
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function openSettings(clientId: number) {
    const res = await fetch(`${API}/api/ap/settings/${clientId}`);
    const data = await res.json();
    setSettings(data);
    setSettingsForm(data);
    setSettingsModal(clientId);
  }

  async function saveSettings() {
    if (!settingsModal) return;
    setSaving(true);
    try {
      await fetch(`${API}/api/ap/settings/${settingsModal}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      toast({ title: "Settings saved" });
      setSettingsModal(null);
    } catch {
      toast({ title: "Error saving settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function openAddModal() {
    setBillForm({ ...EMPTY_BILL });
    setBillModal("add");
  }

  function openEditModal(bill: ApBill) {
    setBillForm({
      client_id: bill.client_id,
      vendor: bill.vendor,
      invoice_number: bill.invoice_number ?? "",
      invoice_date: bill.invoice_date ?? "",
      due_date: bill.due_date,
      amount: String(bill.amount),
      category: bill.category ?? "",
      notes: bill.notes ?? "",
      attachment_url: bill.attachment_url ?? "",
    });
    setBillModal(bill);
  }

  const displayedBills = bills;

  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Accounts Payable</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track bills, approvals, and payment cycles</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium shadow-sm hover:opacity-90 transition-opacity"
          style={{ backgroundColor: "#266b75" }}
        >
          <Plus className="w-4 h-4" /> Add Bill
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Total Outstanding"
          value={fmt(totalOutstanding)}
          sub={`${allBills.filter(b => b.status !== "paid").length} bills`}
          color="#266b75"
        />
        <SummaryCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Due Soon"
          value={fmt(dueSoonBills.reduce((s, b) => s + b.amount, 0))}
          sub={`${dueSoonBills.length} bill${dueSoonBills.length !== 1 ? "s" : ""}`}
          color="#b45309"
        />
        <SummaryCard
          icon={<Clock className="w-5 h-5" />}
          label="Awaiting Approval"
          value={fmt(awaitingBills.reduce((s, b) => s + b.amount, 0))}
          sub={`${awaitingBills.length} bill${awaitingBills.length !== 1 ? "s" : ""}`}
          color="#1d4ed8"
        />
        <SummaryCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="Approved & Ready"
          value={fmt(approvedBills.reduce((s, b) => s + b.amount, 0))}
          sub={`${approvedBills.length} bill${approvedBills.length !== 1 ? "s" : ""}`}
          color="#15803d"
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">Filters:</span>
          </div>
          <select
            value={filterClient === "all" ? "all" : String(filterClient)}
            onChange={e => setFilterClient(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30"
          >
            <option value="all">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex flex-wrap gap-1.5">
            {(["all", ...ALL_STATUSES] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s as BillStatus | "all")}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filterStatus === s
                    ? "text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                style={filterStatus === s ? { backgroundColor: "#266b75" } : {}}
              >
                {s === "all" ? "All" : STATUS_CONFIG[s as BillStatus].label}
              </button>
            ))}
          </div>
          <div className="ml-auto text-sm font-medium text-slate-500">
            {displayedBills.length} bill{displayedBills.length !== 1 ? "s" : ""} ·{" "}
            <span className="text-slate-800">{fmt(displayedBills.filter(b => b.status !== "paid").reduce((s, b) => s + b.amount, 0))} outstanding</span>
          </div>
        </div>
      </div>

      {/* Bills Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Loading bills…</div>
        ) : displayedBills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
            <Receipt className="w-8 h-8 opacity-40" />
            <span className="text-sm">No bills found. Add one to get started.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Client", "Vendor", "Invoice #", "Inv. Date", "Due Date", "Amount", "Category", "Status", "Actions"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayedBills.map(bill => (
                  <BillRow
                    key={bill.id}
                    bill={bill}
                    onEdit={() => openEditModal(bill)}
                    onDelete={() => deleteBill(bill.id)}
                    onSetStatus={(s) => setStatus(bill, s)}
                    onReject={() => { setRejectModal(bill); setRejectNote(""); }}
                    onSnooze={() => { setSnoozeModal(bill); setSnoozeDate(""); setSnoozeManual(false); }}
                    onViewNote={() => setNoteViewModal(bill)}
                    onSettings={() => openSettings(bill.client_id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Bill Modal */}
      {billModal !== null && (
        <Modal title={billModal === "add" ? "Add Bill" : "Edit Bill"} onClose={() => setBillModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Client *</label>
                <select
                  value={billForm.client_id}
                  onChange={e => setBillForm(f => ({ ...f, client_id: Number(e.target.value) }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30"
                >
                  <option value={0}>Select client…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Vendor *</label>
                <input
                  value={billForm.vendor}
                  onChange={e => setBillForm(f => ({ ...f, vendor: e.target.value }))}
                  placeholder="Vendor name"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Invoice #</label>
                <input
                  value={billForm.invoice_number}
                  onChange={e => setBillForm(f => ({ ...f, invoice_number: e.target.value }))}
                  placeholder="Optional"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={billForm.amount}
                    onChange={e => setBillForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-slate-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Invoice Date</label>
                <input
                  type="date"
                  value={billForm.invoice_date}
                  onChange={e => setBillForm(f => ({ ...f, invoice_date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Due Date *</label>
                <input
                  type="date"
                  value={billForm.due_date}
                  onChange={e => setBillForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
                <input
                  list="ap-categories"
                  value={billForm.category}
                  onChange={e => setBillForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="Select or type a category"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30"
                />
                <datalist id="ap-categories">
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={billForm.notes}
                  onChange={e => setBillForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 resize-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Attachment URL</label>
                <input
                  value={billForm.attachment_url}
                  onChange={e => setBillForm(f => ({ ...f, attachment_url: e.target.value }))}
                  placeholder="https://… (link to PDF or document)"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
              <button onClick={() => setBillModal(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
              <button
                onClick={submitBillForm}
                disabled={saving}
                className="px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: "#266b75" }}
              >
                {saving ? "Saving…" : billModal === "add" ? "Add Bill" : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <Modal title="Reject Bill" onClose={() => setRejectModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Rejecting <span className="font-medium">{rejectModal.vendor}</span> — {fmt(rejectModal.amount)}.
              A rejection note is required.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Rejection Note *</label>
              <textarea
                rows={3}
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                placeholder="Reason for rejection…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/30 resize-none"
              />
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
              <button onClick={() => setRejectModal(null)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button
                onClick={submitReject}
                className="px-5 py-2 rounded-lg text-white text-sm font-medium bg-red-600 hover:bg-red-700"
              >
                Reject Bill
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Snooze Modal */}
      {snoozeModal && (
        <Modal title="Snooze Bill" onClose={() => setSnoozeModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Snoozing <span className="font-medium">{snoozeModal.vendor}</span> — {fmt(snoozeModal.amount)}.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setSnoozeManual(false)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  !snoozeManual ? "border-[#266b75] text-[#266b75] bg-[#266b75]/5" : "border-slate-200 text-slate-600"
                }`}
              >
                Auto (next cycle)
              </button>
              <button
                onClick={() => setSnoozeManual(true)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  snoozeManual ? "border-[#266b75] text-[#266b75] bg-[#266b75]/5" : "border-slate-200 text-slate-600"
                }`}
              >
                Pick a date
              </button>
            </div>
            {snoozeManual && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Snooze Until</label>
                <input
                  type="date"
                  value={snoozeDate}
                  onChange={e => setSnoozeDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30"
                />
              </div>
            )}
            {!snoozeManual && (
              <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                The bill will be snoozed until the next payment day configured in that client's AP settings.
              </p>
            )}
            <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
              <button onClick={() => setSnoozeModal(null)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button
                onClick={submitSnooze}
                disabled={saving || (snoozeManual && !snoozeDate)}
                className="px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: "#266b75" }}
              >
                {saving ? "Saving…" : "Snooze Bill"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Note View Modal */}
      {noteViewModal && (
        <Modal title="Rejection Note" onClose={() => setNoteViewModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Bill: <span className="font-medium">{noteViewModal.vendor}</span> — {fmt(noteViewModal.amount)}
            </p>
            <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
              {noteViewModal.client_response_note || "No note provided."}
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
              <button onClick={() => setNoteViewModal(null)} className="px-4 py-2 text-sm text-slate-600">Close</button>
              <button
                onClick={async () => {
                  await setStatus(noteViewModal, "due_soon");
                  setNoteViewModal(null);
                }}
                className="px-5 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: "#266b75" }}
              >
                Re-open (→ Due Soon)
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* AP Settings Modal */}
      {settingsModal !== null && settingsForm && (
        <Modal
          title={`AP Settings — ${clients.find(c => c.id === settingsModal)?.name ?? "Client"}`}
          onClose={() => setSettingsModal(null)}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Cycle Window (days)</label>
                <input
                  type="number" min={1}
                  value={settingsForm.cycle_window_days ?? 14}
                  onChange={e => setSettingsForm(f => ({ ...f, cycle_window_days: Number(e.target.value) }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30"
                />
                <p className="text-xs text-slate-400 mt-1">Bills due within this many days auto-move to "Due Soon"</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Day</label>
                <select
                  value={settingsForm.payment_day ?? "tuesday"}
                  onChange={e => setSettingsForm(f => ({ ...f, payment_day: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30"
                >
                  {WEEKDAYS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Approval Send Day</label>
                <select
                  value={settingsForm.approval_send_day ?? "wednesday"}
                  onChange={e => setSettingsForm(f => ({ ...f, approval_send_day: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30"
                >
                  {WEEKDAYS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-2">Snooze Behavior</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSettingsForm(f => ({ ...f, snooze_auto: true }))}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                      settingsForm.snooze_auto !== false ? "border-[#266b75] text-[#266b75] bg-[#266b75]/5" : "border-slate-200 text-slate-600"
                    }`}
                  >
                    Auto next cycle
                  </button>
                  <button
                    onClick={() => setSettingsForm(f => ({ ...f, snooze_auto: false }))}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                      settingsForm.snooze_auto === false ? "border-[#266b75] text-[#266b75] bg-[#266b75]/5" : "border-slate-200 text-slate-600"
                    }`}
                  >
                    Manual date
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
              <button onClick={() => setSettingsModal(null)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button
                onClick={saveSettings}
                disabled={saving}
                className="px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: "#266b75" }}
              >
                {saving ? "Saving…" : "Save Settings"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        <span className="p-2 rounded-lg" style={{ backgroundColor: color + "18", color }}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// Lucide Receipt for empty state
function Receipt({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6 0m-6-4.5l6 0m-6-4.5l6 0M4.5 3.75A.75.75 0 015.25 3h13.5a.75.75 0 01.75.75v16.5a.75.75 0 01-1.06.69L15 18.94l-3.44 2-3.44-2-3.44 2a.75.75 0 01-1.06-.69V3.75z" />
    </svg>
  );
}

function BillRow({ bill, onEdit, onDelete, onSetStatus, onReject, onSnooze, onViewNote, onSettings }: {
  bill: ApBill;
  onEdit: () => void;
  onDelete: () => void;
  onSetStatus: (s: BillStatus) => void;
  onReject: () => void;
  onSnooze: () => void;
  onViewNote: () => void;
  onSettings: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <tr className="hover:bg-slate-50/60 transition-colors">
      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
        {bill.client_name ?? `Client ${bill.client_id}`}
      </td>
      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{bill.vendor}</td>
      <td className="px-4 py-3 text-slate-500">{bill.invoice_number || "—"}</td>
      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(bill.invoice_date)}</td>
      <td className={`px-4 py-3 whitespace-nowrap ${dueDateClass(bill.due_date, bill.status)}`}>
        {fmtDate(bill.due_date)}
      </td>
      <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{fmt(bill.amount)}</td>
      <td className="px-4 py-3 text-slate-500">{bill.category || "—"}</td>
      <td className="px-4 py-3"><StatusBadge status={bill.status} /></td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {/* Contextual primary actions */}
          {bill.status === "due_soon" && (
            <ActionBtn onClick={() => onSetStatus("sent_for_approval")} label="Mark as Sent" icon={<Send className="w-3.5 h-3.5" />} color="blue" />
          )}
          {bill.status === "sent_for_approval" && (<>
            <ActionBtn onClick={() => onSetStatus("approved")} label="Approve" icon={<Check className="w-3.5 h-3.5" />} color="green" />
            <ActionBtn onClick={onSnooze} label="Snooze" icon={<CalendarClock className="w-3.5 h-3.5" />} color="purple" />
            <ActionBtn onClick={onReject} label="Reject" icon={<Ban className="w-3.5 h-3.5" />} color="red" />
          </>)}
          {bill.status === "approved" && (
            <ActionBtn onClick={() => onSetStatus("paid")} label="Mark as Paid" icon={<CheckCircle2 className="w-3.5 h-3.5" />} color="green" />
          )}
          {bill.status === "snoozed" && (
            <ActionBtn onClick={() => onSetStatus("due_soon")} label="Re-enter Cycle" icon={<RotateCcw className="w-3.5 h-3.5" />} color="teal" />
          )}
          {bill.status === "rejected" && (
            <ActionBtn onClick={onViewNote} label="View Note" icon={<Eye className="w-3.5 h-3.5" />} color="red" />
          )}

          {/* Overflow menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="More actions"
              aria-label="More actions"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-lg border border-slate-100 py-1 w-44"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <MenuItem icon={<Pencil className="w-3.5 h-3.5" />} label="Edit" onClick={() => { onEdit(); setMenuOpen(false); }} />
                {bill.attachment_url && (
                  <MenuItem
                    icon={<Paperclip className="w-3.5 h-3.5" />}
                    label="View Attachment"
                    onClick={() => { window.open(bill.attachment_url!, "_blank"); setMenuOpen(false); }}
                  />
                )}
                <MenuItem
                  icon={<ExternalLink className="w-3.5 h-3.5" />}
                  label="AP Settings"
                  onClick={() => { onSettings(); setMenuOpen(false); }}
                />
                {bill.status === "snoozed" && (
                  <MenuItem icon={<CalendarClock className="w-3.5 h-3.5" />} label="Edit Snooze Date" onClick={() => { onSnooze(); setMenuOpen(false); }} />
                )}
                <div className="my-1 border-t border-slate-100" />
                <MenuItem icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" onClick={() => { onDelete(); setMenuOpen(false); }} danger />
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function ActionBtn({ onClick, label, icon, color }: {
  onClick: () => void; label: string; icon: React.ReactNode; color: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 hover:bg-blue-100",
    green: "bg-green-50 text-green-700 hover:bg-green-100",
    purple: "bg-purple-50 text-purple-700 hover:bg-purple-100",
    red: "bg-red-50 text-red-600 hover:bg-red-100",
    teal: "bg-[#266b75]/10 text-[#266b75] hover:bg-[#266b75]/20",
  };
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${colors[color] ?? colors.teal}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function MenuItem({ icon, label, onClick, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors ${
        danger ? "text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      {icon} {label}
    </button>
  );
}

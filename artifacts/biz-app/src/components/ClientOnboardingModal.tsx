import React, { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, ChevronRight, ChevronLeft, Check, Briefcase, BookOpen, Monitor, User, Lock, Star, Send, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListClientsQueryKey, getGetDashboardQueryKey } from "@workspace/api-client-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type Services = "bookkeeping" | "va" | "both";

interface OnboardingData {
  services: Services | "";
  contact_name: string;
  name: string;
  email: string;
  phone: string;
  industry: string;
  bk_software: string;
  bk_existing_accounts: string;
  bk_fiscal_year_end: string;
  bk_accounting_basis: string;
  bk_business_bank_account: string;
  bk_notes: string;
  va_task_types: string[];
  va_tools: string;
  va_communication: string;
  va_availability: string;
  access_notes: string;
  goals: string;
  other_notes: string;
  send_invite: boolean;
}

const EMPTY: OnboardingData = {
  services: "", contact_name: "", name: "", email: "", phone: "", industry: "",
  bk_software: "", bk_existing_accounts: "", bk_fiscal_year_end: "", bk_accounting_basis: "",
  bk_business_bank_account: "", bk_notes: "",
  va_task_types: [], va_tools: "", va_communication: "", va_availability: "",
  access_notes: "", goals: "", other_notes: "", send_invite: true,
};

const VA_TASKS = ["Email management", "Scheduling", "Data entry", "Customer follow-up", "Social media", "Research", "Other"];
const BK_SOFTWARE = ["QuickBooks", "Wave", "Xero", "FreshBooks", "None", "Other"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const COMMS = ["Email", "Slack", "Voxer", "Text", "Phone"];

// ─── Shared style helpers ────────────────────────────────────────────────────

const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#266b75]/40 focus:border-[#266b75] transition-colors";
const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5";
const sectionCls = "bg-white rounded-2xl border border-slate-100 p-5 space-y-4";

// ─── Step components ─────────────────────────────────────────────────────────

function Step1Services({ data, set }: { data: OnboardingData; set: (k: keyof OnboardingData, v: any) => void }) {
  const opts: { value: Services; label: string; desc: string; icon: React.ReactNode }[] = [
    { value: "bookkeeping", label: "Bookkeeping Only", desc: "Financial records, reconciliation & reporting", icon: <BookOpen className="w-5 h-5" /> },
    { value: "va", label: "Virtual Assistant Only", desc: "Admin tasks, scheduling & communication support", icon: <Monitor className="w-5 h-5" /> },
    { value: "both", label: "Both Bookkeeping & VA", desc: "Full service — books plus virtual assistant support", icon: <Briefcase className="w-5 h-5" /> },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Select the service(s) this client needs. This determines which sections of the form will appear.</p>
      {opts.map(o => (
        <button key={o.value} type="button"
          onClick={() => set("services", o.value)}
          className={`w-full flex items-start gap-4 rounded-2xl border-2 p-4 text-left transition-all ${data.services === o.value ? "border-[#266b75] bg-[#266b75]/5" : "border-slate-200 hover:border-slate-300 bg-white"}`}>
          <span className={`mt-0.5 p-2 rounded-xl ${data.services === o.value ? "bg-[#266b75] text-white" : "bg-slate-100 text-slate-500"}`}>{o.icon}</span>
          <div>
            <p className={`font-semibold ${data.services === o.value ? "text-[#266b75]" : "text-slate-800"}`}>{o.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{o.desc}</p>
          </div>
          {data.services === o.value && <Check className="w-4 h-4 text-[#266b75] ml-auto mt-1 shrink-0" />}
        </button>
      ))}
    </div>
  );
}

function Step2Business({ data, set }: { data: OnboardingData; set: (k: keyof OnboardingData, v: any) => void }) {
  return (
    <div className={sectionCls}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Client Name</label>
          <input className={inputCls} placeholder="Jane Smith" value={data.contact_name} onChange={e => set("contact_name", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Business Name <span className="text-red-400">*</span></label>
          <input className={inputCls} placeholder="Acme Corp" value={data.name} onChange={e => set("name", e.target.value)} required />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Email Address <span className="text-red-400">*</span></label>
          <input type="email" className={inputCls} placeholder="billing@acmecorp.com" value={data.email} onChange={e => set("email", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Phone Number</label>
          <input type="tel" className={inputCls} placeholder="(555) 123-4567" value={data.phone} onChange={e => set("phone", e.target.value)} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Industry / Type of Business</label>
        <input className={inputCls} placeholder="e.g. E-commerce, Real Estate, Consulting…" value={data.industry} onChange={e => set("industry", e.target.value)} />
      </div>
    </div>
  );
}

function Step3Bookkeeping({ data, set }: { data: OnboardingData; set: (k: keyof OnboardingData, v: any) => void }) {
  return (
    <div className="space-y-4">
      <div className={sectionCls}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Accounting Software</label>
            <select className={inputCls} value={data.bk_software} onChange={e => set("bk_software", e.target.value)}>
              <option value="">Select…</option>
              {BK_SOFTWARE.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Existing Accounts Set Up?</label>
            <select className={inputCls} value={data.bk_existing_accounts} onChange={e => set("bk_existing_accounts", e.target.value)}>
              <option value="">Select…</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Fiscal Year End (Month)</label>
            <select className={inputCls} value={data.bk_fiscal_year_end} onChange={e => set("bk_fiscal_year_end", e.target.value)}>
              <option value="">Select…</option>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Accounting Basis</label>
            <select className={inputCls} value={data.bk_accounting_basis} onChange={e => set("bk_accounting_basis", e.target.value)}>
              <option value="">Select…</option>
              <option value="Cash">Cash basis</option>
              <option value="Accrual">Accrual basis</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Dedicated Business Bank Account?</label>
          <select className={inputCls} value={data.bk_business_bank_account} onChange={e => set("bk_business_bank_account", e.target.value)}>
            <option value="">Select…</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Notes on Current Bookkeeping Situation</label>
          <textarea className={inputCls + " resize-none"} rows={3} placeholder="Any context about their current state, challenges, or history…" value={data.bk_notes} onChange={e => set("bk_notes", e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function Step4VA({ data, set }: { data: OnboardingData; set: (k: keyof OnboardingData, v: any) => void }) {
  const toggleTask = (t: string) => {
    const cur = data.va_task_types;
    set("va_task_types", cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t]);
  };
  return (
    <div className="space-y-4">
      <div className={sectionCls}>
        <div>
          <label className={labelCls}>Types of Tasks Needed <span className="text-slate-400 font-normal normal-case tracking-normal">(select all that apply)</span></label>
          <div className="flex flex-wrap gap-2 mt-1">
            {VA_TASKS.map(t => (
              <button key={t} type="button"
                onClick={() => toggleTask(t)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-all ${data.va_task_types.includes(t) ? "bg-[#266b75] text-white border-[#266b75]" : "bg-white text-slate-600 border-slate-200 hover:border-[#266b75]/40"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>Tools / Platforms They Use</label>
          <input className={inputCls} placeholder="e.g. Google Workspace, Asana, Trello, Slack…" value={data.va_tools} onChange={e => set("va_tools", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Preferred Communication Method</label>
          <div className="flex flex-wrap gap-2">
            {COMMS.map(c => (
              <button key={c} type="button"
                onClick={() => set("va_communication", c)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-all ${data.va_communication === c ? "bg-[#266b75] text-white border-[#266b75]" : "bg-white text-slate-600 border-slate-200 hover:border-[#266b75]/40"}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>Availability / Working Hours Expectations</label>
          <textarea className={inputCls + " resize-none"} rows={2} placeholder="e.g. Mon–Fri 9am–5pm EST, response within 24 hrs…" value={data.va_availability} onChange={e => set("va_availability", e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function Step5Access({ data, set }: { data: OnboardingData; set: (k: keyof OnboardingData, v: any) => void }) {
  return (
    <div className={sectionCls}>
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <Lock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-800">Use this section to note <strong>what access you'll need</strong>. Never enter actual passwords here — share credentials via a secure method separately.</p>
      </div>
      <div>
        <label className={labelCls}>Software Access & Logins Needed</label>
        <textarea className={inputCls + " resize-none"} rows={5}
          placeholder={"Examples:\n• QuickBooks Online — they will share login via LastPass\n• Google Drive folder — will be added as editor\n• Stripe read-only access — to be arranged\n• Asana workspace invite needed"}
          value={data.access_notes} onChange={e => set("access_notes", e.target.value)} />
      </div>
    </div>
  );
}

function Step6Goals({ data, set }: { data: OnboardingData; set: (k: keyof OnboardingData, v: any) => void }) {
  return (
    <div className={sectionCls}>
      <div>
        <label className={labelCls}>Top Goals for Working Together</label>
        <textarea className={inputCls + " resize-none"} rows={4}
          placeholder={"e.g.\n1. Get books caught up and reconciled for the year\n2. Reduce time spent on admin tasks by 50%\n3. Have clean financials ready for tax season"}
          value={data.goals} onChange={e => set("goals", e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>Anything Else to Know?</label>
        <textarea className={inputCls + " resize-none"} rows={3} placeholder="Any context, concerns, or special requirements…" value={data.other_notes} onChange={e => set("other_notes", e.target.value)} />
      </div>
    </div>
  );
}

function Step7Portal({ data, set }: { data: OnboardingData; set: (k: keyof OnboardingData, v: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 bg-[#266b75]/8 border border-[#266b75]/20 rounded-xl px-4 py-3">
        <CheckCircle2 className="w-4 h-4 text-[#266b75] mt-0.5 shrink-0" />
        <p className="text-sm text-[#266b75]">Once onboarding is complete, the client can log into their own portal to view invoices and project updates.</p>
      </div>
      <div className={sectionCls}>
        <div>
          <label className={labelCls}>Portal Login Email</label>
          <input type="email" className={inputCls} value={data.email} onChange={e => set("email", e.target.value)} placeholder="billing@acmecorp.com" />
          <p className="text-xs text-slate-400 mt-1">Pre-filled from Step 2. Edit if the portal login should use a different address.</p>
        </div>
        <label className="flex items-start gap-3 cursor-pointer select-none rounded-xl border border-[#266b75]/30 bg-[#266b75]/5 px-4 py-3 hover:bg-[#266b75]/10 transition-colors">
          <input type="checkbox" checked={data.send_invite} onChange={e => set("send_invite", e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded accent-[#266b75] shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5 text-[#266b75]" />
              Send portal invite email on submission
            </p>
            <p className="text-xs text-slate-500 mt-0.5">The client will receive an email with a "Set Up My Account" link (valid 7 days).</p>
          </div>
        </label>
      </div>
    </div>
  );
}

function Step8Review({ data }: { data: OnboardingData }) {
  const hasBK = data.services === "bookkeeping" || data.services === "both";
  const hasVA = data.services === "va" || data.services === "both";
  const Row = ({ label, value }: { label: string; value?: string | string[] | null }) => {
    if (!value || (Array.isArray(value) && value.length === 0)) return null;
    return (
      <div className="flex gap-3 text-sm">
        <span className="text-slate-400 shrink-0 w-36">{label}</span>
        <span className="text-slate-800 font-medium">{Array.isArray(value) ? value.join(", ") : value}</span>
      </div>
    );
  };
  return (
    <div className="space-y-4 text-sm">
      <div className={sectionCls + " space-y-2"}>
        <p className="text-xs font-bold uppercase tracking-wider text-[#266b75]">Service</p>
        <Row label="Services" value={data.services === "bookkeeping" ? "Bookkeeping" : data.services === "va" ? "Virtual Assistant" : "Bookkeeping & VA"} />
      </div>
      <div className={sectionCls + " space-y-2"}>
        <p className="text-xs font-bold uppercase tracking-wider text-[#266b75]">Client</p>
        <Row label="Name" value={data.contact_name || data.name} />
        <Row label="Business" value={data.name} />
        <Row label="Email" value={data.email} />
        <Row label="Phone" value={data.phone} />
        <Row label="Industry" value={data.industry} />
      </div>
      {hasBK && (
        <div className={sectionCls + " space-y-2"}>
          <p className="text-xs font-bold uppercase tracking-wider text-[#266b75]">Bookkeeping</p>
          <Row label="Software" value={data.bk_software} />
          <Row label="Existing accounts" value={data.bk_existing_accounts} />
          <Row label="Fiscal year end" value={data.bk_fiscal_year_end} />
          <Row label="Accounting basis" value={data.bk_accounting_basis} />
          <Row label="Business bank acct" value={data.bk_business_bank_account} />
          <Row label="Notes" value={data.bk_notes} />
        </div>
      )}
      {hasVA && (
        <div className={sectionCls + " space-y-2"}>
          <p className="text-xs font-bold uppercase tracking-wider text-[#266b75]">Virtual Assistant</p>
          <Row label="Task types" value={data.va_task_types} />
          <Row label="Tools" value={data.va_tools} />
          <Row label="Communication" value={data.va_communication} />
          <Row label="Availability" value={data.va_availability} />
        </div>
      )}
      {data.access_notes && (
        <div className={sectionCls + " space-y-2"}>
          <p className="text-xs font-bold uppercase tracking-wider text-[#266b75]">Access & Credentials</p>
          <p className="text-slate-700 whitespace-pre-line">{data.access_notes}</p>
        </div>
      )}
      {data.goals && (
        <div className={sectionCls + " space-y-2"}>
          <p className="text-xs font-bold uppercase tracking-wider text-[#266b75]">Goals</p>
          <p className="text-slate-700 whitespace-pre-line">{data.goals}</p>
          {data.other_notes && <p className="text-slate-500 italic whitespace-pre-line">{data.other_notes}</p>}
        </div>
      )}
      <div className={sectionCls + " space-y-2"}>
        <p className="text-xs font-bold uppercase tracking-wider text-[#266b75]">Portal Access</p>
        <Row label="Login email" value={data.email} />
        <Row label="Invite email" value={data.send_invite ? "Will be sent on submit" : "Not sending"} />
      </div>
    </div>
  );
}

// ─── Step config ─────────────────────────────────────────────────────────────

function buildSteps(services: Services | "") {
  const hasBK = services === "bookkeeping" || services === "both";
  const hasVA = services === "va" || services === "both";
  return [
    { id: 1, label: "Services",     icon: <Briefcase className="w-4 h-4" />, show: true },
    { id: 2, label: "Business",     icon: <User className="w-4 h-4" />,      show: true },
    { id: 3, label: "Bookkeeping",  icon: <BookOpen className="w-4 h-4" />,  show: hasBK },
    { id: 4, label: "VA Details",   icon: <Monitor className="w-4 h-4" />,   show: hasVA },
    { id: 5, label: "Access",       icon: <Lock className="w-4 h-4" />,      show: true },
    { id: 6, label: "Goals",        icon: <Star className="w-4 h-4" />,      show: true },
    { id: 7, label: "Portal",       icon: <Send className="w-4 h-4" />,      show: true },
    { id: 8, label: "Review",       icon: <Check className="w-4 h-4" />,     show: true },
  ].filter(s => s.show);
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function ClientOnboardingModal({ isOpen, onClose }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [data, setData] = useState<OnboardingData>(EMPTY);
  const [stepId, setStepId] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ clientName: string; email: string } | null>(null);

  // Delivery mode: pending = hasn't chosen yet, fill = Complete Form Now, send = Send Form to Client
  const [deliveryMode, setDeliveryMode] = useState<"pending" | "fill" | "send">("pending");
  const [showDelivery, setShowDelivery] = useState(false);
  const [sendName, setSendName] = useState("");
  const [sendContactName, setSendContactName] = useState("");
  const [sendEmail, setSendEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendDone, setSendDone] = useState<{ name: string; email: string } | null>(null);

  const set = useCallback((k: keyof OnboardingData, v: any) => setData(d => ({ ...d, [k]: v })), []);

  const steps = buildSteps(data.services);
  const currentIdx = steps.findIndex(s => s.id === stepId);
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === steps.length - 1;

  const goNext = () => {
    if (stepId === 1 && !data.services) { toast({ title: "Please select a service", variant: "destructive" }); return; }
    if (stepId === 1 && deliveryMode === "pending") {
      setShowDelivery(true);
      return;
    }
    if (stepId === 2 && (!data.name || !data.email)) { toast({ title: "Business name and email are required", variant: "destructive" }); return; }
    const next = steps[currentIdx + 1];
    if (next) setStepId(next.id);
  };
  const goPrev = () => {
    if (stepId === 2 && deliveryMode === "fill") {
      setShowDelivery(true);
      setDeliveryMode("pending");
      return;
    }
    const prev = steps[currentIdx - 1];
    if (prev) setStepId(prev.id);
  };

  const handleClose = () => {
    setData(EMPTY);
    setStepId(1);
    setDone(null);
    setDeliveryMode("pending");
    setShowDelivery(false);
    setSendName("");
    setSendContactName("");
    setSendEmail("");
    setSending(false);
    setSendDone(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!data.name || !data.email || !data.services) {
      toast({ title: "Missing required fields", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/clients/onboard", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          contact_name: data.contact_name || null,
          email: data.email,
          phone: data.phone || null,
          services: data.services,
          industry: data.industry || null,
          bk_software: data.bk_software || null,
          bk_existing_accounts: data.bk_existing_accounts || null,
          bk_fiscal_year_end: data.bk_fiscal_year_end || null,
          bk_accounting_basis: data.bk_accounting_basis || null,
          bk_business_bank_account: data.bk_business_bank_account || null,
          bk_notes: data.bk_notes || null,
          va_task_types: data.va_task_types.length ? data.va_task_types : null,
          va_tools: data.va_tools || null,
          va_communication: data.va_communication || null,
          va_availability: data.va_availability || null,
          access_notes: data.access_notes || null,
          goals: data.goals || null,
          other_notes: data.other_notes || null,
          send_invite: data.send_invite,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to onboard client");
      queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      setDone({ clientName: data.contact_name || data.name, email: data.email });
    } catch (err: any) {
      toast({ title: "Onboarding failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendForm = async () => {
    if (!sendName.trim() || !sendEmail.trim()) {
      toast({ title: "Business name and email are required", variant: "destructive" }); return;
    }
    setSending(true);
    try {
      const createRes = await fetch("/api/clients/onboard", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sendName.trim(),
          contact_name: sendContactName.trim() || null,
          email: sendEmail.trim(),
          services: data.services,
          send_invite: false,
        }),
      });
      const createJson = await createRes.json().catch(() => ({}));
      if (!createRes.ok) throw new Error(createJson.error ?? "Failed to create client");
      const newClientId = createJson.client?.id;

      const sendRes = await fetch(`/api/clients/${newClientId}/send-onboarding-form`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: sendEmail.trim() }),
      });
      const sendJson = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) throw new Error(sendJson.error ?? "Failed to send onboarding form");

      queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      setSendDone({ name: sendContactName.trim() || sendName.trim(), email: sendEmail.trim() });
    } catch (err: any) {
      toast({ title: "Failed to send form", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm" onClick={handleClose} />

          <motion.div
            initial={{ opacity: 0, x: "100%" }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl flex flex-col bg-slate-50 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-lg font-display font-bold text-slate-900">Onboard a New Client</h2>
                {!done && !sendDone && !showDelivery && (
                  <p className="text-xs text-slate-400 mt-0.5">Step {currentIdx + 1} of {steps.length} — {steps[currentIdx]?.label}</p>
                )}
                {!done && !sendDone && showDelivery && deliveryMode === "pending" && (
                  <p className="text-xs text-slate-400 mt-0.5">How would you like to complete this form?</p>
                )}
                {!done && !sendDone && showDelivery && deliveryMode === "send" && (
                  <p className="text-xs text-slate-400 mt-0.5">Send onboarding form to client</p>
                )}
              </div>
              <button onClick={handleClose} className="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Progress bar — only when filling the form normally */}
            {!done && !sendDone && !showDelivery && (
              <div className="px-6 pt-4 pb-2 shrink-0 bg-white border-b border-slate-100">
                <div className="flex gap-1">
                  {steps.map((s, i) => (
                    <div key={s.id} className={`h-1.5 flex-1 rounded-full transition-all ${i <= currentIdx ? "bg-[#266b75]" : "bg-slate-200"}`} />
                  ))}
                </div>
                <div className="flex gap-1 mt-2">
                  {steps.map((s, i) => (
                    <div key={s.id} className="flex-1 text-center">
                      <span className={`text-[9px] font-semibold uppercase tracking-wide ${i === currentIdx ? "text-[#266b75]" : i < currentIdx ? "text-slate-400" : "text-slate-300"}`}>
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {done ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-5">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Onboarding Complete!</h3>
                    <p className="text-slate-500 mt-1">
                      <span className="font-semibold">{done.clientName}</span> has been added to your client list.
                    </p>
                  </div>
                  {data.send_invite && (
                    <div className="bg-[#266b75]/8 border border-[#266b75]/20 rounded-2xl px-6 py-4 text-sm text-[#266b75] max-w-xs">
                      <Send className="w-4 h-4 mx-auto mb-1.5" />
                      A portal invite was sent to <strong>{done.email}</strong>. They can use it to set up their login.
                    </div>
                  )}
                  <button onClick={handleClose} className="mt-2 bg-[#266b75] hover:bg-[#1d5159] text-white font-semibold px-6 py-2.5 rounded-xl transition-colors">
                    Done
                  </button>
                </div>
              ) : sendDone ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-5">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Form Sent!</h3>
                    <p className="text-slate-500 mt-1">
                      <span className="font-semibold">{sendDone.name}</span> will receive the onboarding form at{" "}
                      <strong>{sendDone.email}</strong>.
                    </p>
                  </div>
                  <div className="bg-[#266b75]/8 border border-[#266b75]/20 rounded-2xl px-6 py-4 text-sm text-[#266b75] max-w-sm">
                    <Send className="w-4 h-4 mx-auto mb-1.5" />
                    The client will complete the form and create their portal login. You'll receive an email notification when they're done.
                  </div>
                  <button onClick={handleClose} className="mt-2 bg-[#266b75] hover:bg-[#1d5159] text-white font-semibold px-6 py-2.5 rounded-xl transition-colors">
                    Done
                  </button>
                </div>
              ) : showDelivery && deliveryMode === "pending" ? (
                <div className="space-y-3 pt-2">
                  <p className="text-sm text-slate-500 mb-4">The service type has been selected. How would you like to complete the onboarding form?</p>
                  <button type="button"
                    onClick={() => { setDeliveryMode("fill"); setShowDelivery(false); setStepId(2); }}
                    className="w-full flex items-start gap-4 rounded-2xl border-2 border-slate-200 hover:border-[#266b75] bg-white p-4 text-left transition-all group">
                    <span className="mt-0.5 p-2 rounded-xl bg-slate-100 text-slate-500 group-hover:bg-[#266b75] group-hover:text-white transition-colors">
                      <User className="w-5 h-5" />
                    </span>
                    <div>
                      <p className="font-semibold text-slate-800">Complete Form Now</p>
                      <p className="text-xs text-slate-500 mt-0.5">Fill in the onboarding form yourself — all steps, review, then save.</p>
                    </div>
                  </button>
                  <button type="button"
                    onClick={() => setDeliveryMode("send")}
                    className="w-full flex items-start gap-4 rounded-2xl border-2 border-slate-200 hover:border-[#266b75] bg-white p-4 text-left transition-all group">
                    <span className="mt-0.5 p-2 rounded-xl bg-slate-100 text-slate-500 group-hover:bg-[#266b75] group-hover:text-white transition-colors">
                      <Send className="w-5 h-5" />
                    </span>
                    <div>
                      <p className="font-semibold text-slate-800">Send Form to Client</p>
                      <p className="text-xs text-slate-500 mt-0.5">Email a secure link so the client fills out the form and sets up their own portal login.</p>
                    </div>
                  </button>
                </div>
              ) : showDelivery && deliveryMode === "send" ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 bg-[#266b75]/8 border border-[#266b75]/20 rounded-xl px-4 py-3">
                    <Send className="w-4 h-4 text-[#266b75] mt-0.5 shrink-0" />
                    <p className="text-sm text-[#266b75]">We'll create the client record and email them a secure link to complete the onboarding form themselves.</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Client Name</label>
                        <input className={inputCls} placeholder="Jane Smith" value={sendContactName} onChange={e => setSendContactName(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Business Name <span className="text-red-400">*</span></label>
                        <input className={inputCls} placeholder="Acme Corp" value={sendName} onChange={e => setSendName(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Client Email Address <span className="text-red-400">*</span></label>
                      <input type="email" className={inputCls} placeholder="client@example.com" value={sendEmail} onChange={e => setSendEmail(e.target.value)} />
                    </div>
                  </div>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div key={stepId} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.18 }}>
                    {stepId === 1 && <Step1Services data={data} set={set} />}
                    {stepId === 2 && <Step2Business data={data} set={set} />}
                    {stepId === 3 && <Step3Bookkeeping data={data} set={set} />}
                    {stepId === 4 && <Step4VA data={data} set={set} />}
                    {stepId === 5 && <Step5Access data={data} set={set} />}
                    {stepId === 6 && <Step6Goals data={data} set={set} />}
                    {stepId === 7 && <Step7Portal data={data} set={set} />}
                    {stepId === 8 && <Step8Review data={data} />}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>

            {/* Footer nav */}
            {!done && !sendDone && (
              <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-between shrink-0">
                {showDelivery && deliveryMode === "pending" ? (
                  <>
                    <button onClick={() => { setShowDelivery(false); }}
                      className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors px-4 py-2 rounded-xl hover:bg-slate-100">
                      <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <div />
                  </>
                ) : showDelivery && deliveryMode === "send" ? (
                  <>
                    <button onClick={() => setDeliveryMode("pending")}
                      className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors px-4 py-2 rounded-xl hover:bg-slate-100">
                      <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button onClick={handleSendForm} disabled={sending}
                      className="flex items-center gap-2 bg-[#266b75] hover:bg-[#1d5159] text-white font-semibold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-60">
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {sending ? "Sending…" : "Send Onboarding Form"}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={goPrev} disabled={isFirst}
                      className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-4 py-2 rounded-xl hover:bg-slate-100">
                      <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                    {isLast ? (
                      <button onClick={handleSubmit} disabled={submitting}
                        className="flex items-center gap-2 bg-[#266b75] hover:bg-[#1d5159] text-white font-semibold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-60">
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        {submitting ? "Submitting…" : "Submit & Save Client"}
                      </button>
                    ) : (
                      <button onClick={goNext}
                        className="flex items-center gap-1.5 bg-[#266b75] hover:bg-[#1d5159] text-white font-semibold px-5 py-2.5 rounded-xl transition-colors">
                        Next <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

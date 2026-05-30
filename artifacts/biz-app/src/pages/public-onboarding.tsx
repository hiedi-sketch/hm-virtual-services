import React, { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight, ChevronLeft, Check, Briefcase, BookOpen, Monitor, Lock,
  Star, Send, Loader2, CheckCircle2, Eye, EyeOff, X,
} from "lucide-react";
import { useParams } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

type Services = "bookkeeping" | "va" | "both";

interface FormData {
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
  portal_email: string;
  portal_password: string;
  portal_password_confirm: string;
}

const EMPTY: FormData = {
  services: "", contact_name: "", name: "", email: "", phone: "", industry: "",
  bk_software: "", bk_existing_accounts: "", bk_fiscal_year_end: "", bk_accounting_basis: "",
  bk_business_bank_account: "", bk_notes: "",
  va_task_types: [], va_tools: "", va_communication: "", va_availability: "",
  access_notes: "", goals: "", other_notes: "",
  portal_email: "", portal_password: "", portal_password_confirm: "",
};

const VA_TASKS = ["Email management", "Scheduling", "Data entry", "Customer follow-up", "Social media", "Research", "Other"];
const BK_SOFTWARE = ["QuickBooks", "Wave", "Xero", "FreshBooks", "None", "Other"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const COMMS = ["Email", "Slack", "Voxer", "Text", "Phone"];

const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#266b75]/40 focus:border-[#266b75] transition-colors";
const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5";
const sectionCls = "bg-white rounded-2xl border border-slate-100 p-5 space-y-4";

// ─── Step components (same as admin form) ─────────────────────────────────────

function Step1Services({ data, set }: { data: FormData; set: (k: keyof FormData, v: any) => void }) {
  const opts = [
    { value: "bookkeeping" as Services, label: "Bookkeeping Only", desc: "Financial records, reconciliation & reporting", icon: <BookOpen className="w-5 h-5" /> },
    { value: "va" as Services, label: "Virtual Assistant Only", desc: "Admin tasks, scheduling & communication support", icon: <Monitor className="w-5 h-5" /> },
    { value: "both" as Services, label: "Both Bookkeeping & VA", desc: "Full service — books plus virtual assistant support", icon: <Briefcase className="w-5 h-5" /> },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Please confirm the services you'll be receiving.</p>
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

function Step2Business({ data, set }: { data: FormData; set: (k: keyof FormData, v: any) => void }) {
  return (
    <div className={sectionCls}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Your Name</label>
          <input className={inputCls} placeholder="Jane Smith" value={data.contact_name} onChange={e => set("contact_name", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Business Name <span className="text-slate-400 font-normal normal-case tracking-normal">(optional)</span></label>
          <input className={inputCls} placeholder="Acme Corp" value={data.name} onChange={e => set("name", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Email Address <span className="text-red-400">*</span></label>
          <input type="email" className={inputCls} value={data.email} onChange={e => set("email", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Phone Number</label>
          <input type="tel" className={inputCls} value={data.phone} onChange={e => set("phone", e.target.value)} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Industry / Type of Business</label>
        <input className={inputCls} placeholder="e.g. E-commerce, Real Estate, Consulting…" value={data.industry} onChange={e => set("industry", e.target.value)} />
      </div>
    </div>
  );
}

function Step3Bookkeeping({ data, set }: { data: FormData; set: (k: keyof FormData, v: any) => void }) {
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
          <textarea className={inputCls + " resize-none"} rows={3} value={data.bk_notes} onChange={e => set("bk_notes", e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function Step4VA({ data, set }: { data: FormData; set: (k: keyof FormData, v: any) => void }) {
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
              <button key={t} type="button" onClick={() => toggleTask(t)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-all ${data.va_task_types.includes(t) ? "bg-[#266b75] text-white border-[#266b75]" : "bg-white text-slate-600 border-slate-200 hover:border-[#266b75]/40"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>Tools / Platforms You Use</label>
          <input className={inputCls} placeholder="e.g. Google Workspace, Asana, Trello, Slack…" value={data.va_tools} onChange={e => set("va_tools", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Preferred Communication Method</label>
          <div className="flex flex-wrap gap-2">
            {COMMS.map(c => (
              <button key={c} type="button" onClick={() => set("va_communication", c)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-all ${data.va_communication === c ? "bg-[#266b75] text-white border-[#266b75]" : "bg-white text-slate-600 border-slate-200 hover:border-[#266b75]/40"}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>Availability / Working Hours Expectations</label>
          <textarea className={inputCls + " resize-none"} rows={2} value={data.va_availability} onChange={e => set("va_availability", e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function Step5Access({ data, set }: { data: FormData; set: (k: keyof FormData, v: any) => void }) {
  return (
    <div className={sectionCls}>
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <Lock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-800">Use this section to note <strong>what access will be needed</strong>. Never enter actual passwords here.</p>
      </div>
      <div>
        <label className={labelCls}>Software Access & Logins Needed</label>
        <textarea className={inputCls + " resize-none"} rows={5}
          placeholder={"Examples:\n• QuickBooks Online — will share login via LastPass\n• Google Drive folder — will be added as editor\n• Stripe read-only access — to be arranged"}
          value={data.access_notes} onChange={e => set("access_notes", e.target.value)} />
      </div>
    </div>
  );
}

function Step6Goals({ data, set }: { data: FormData; set: (k: keyof FormData, v: any) => void }) {
  return (
    <div className={sectionCls}>
      <div>
        <label className={labelCls}>Top Goals for Working Together</label>
        <textarea className={inputCls + " resize-none"} rows={4}
          placeholder={"e.g.\n1. Get books caught up and reconciled\n2. Reduce time spent on admin tasks\n3. Have clean financials ready for tax season"}
          value={data.goals} onChange={e => set("goals", e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>Anything Else to Know?</label>
        <textarea className={inputCls + " resize-none"} rows={3} value={data.other_notes} onChange={e => set("other_notes", e.target.value)} />
      </div>
    </div>
  );
}

function Step7Portal({ data, set }: { data: FormData; set: (k: keyof FormData, v: any) => void }) {
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const pwMatch = !data.portal_password_confirm || data.portal_password === data.portal_password_confirm;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 bg-[#266b75]/8 border border-[#266b75]/20 rounded-xl px-4 py-3">
        <CheckCircle2 className="w-4 h-4 text-[#266b75] mt-0.5 shrink-0" />
        <p className="text-sm text-[#266b75]">After you submit, your client portal will be activated automatically using the email and password you set here.</p>
      </div>
      <div className={sectionCls}>
        <div>
          <label className={labelCls}>Portal Login Email <span className="text-red-400">*</span></label>
          <input type="email" className={inputCls} value={data.portal_email} onChange={e => set("portal_email", e.target.value)} />
          <p className="text-xs text-slate-400 mt-1">This will be your login email for the client portal. Pre-filled from your account — edit if you'd like to use a different address.</p>
        </div>
        <div>
          <label className={labelCls}>Create Password <span className="text-red-400">*</span></label>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              className={inputCls + " pr-10"}
              placeholder="At least 8 characters"
              value={data.portal_password}
              onChange={e => set("portal_password", e.target.value)}
            />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className={labelCls}>Confirm Password <span className="text-red-400">*</span></label>
          <div className="relative">
            <input
              type={showConfirm ? "text" : "password"}
              className={inputCls + ` pr-10 ${!pwMatch ? "border-red-300 focus:border-red-400 focus:ring-red-200" : ""}`}
              placeholder="Re-enter your password"
              value={data.portal_password_confirm}
              onChange={e => set("portal_password_confirm", e.target.value)}
            />
            <button type="button" onClick={() => setShowConfirm(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {!pwMatch && <p className="text-xs text-red-500 mt-1">Passwords do not match</p>}
        </div>
      </div>
    </div>
  );
}

function Step8Review({ data }: { data: FormData }) {
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
        <p className="text-xs font-bold uppercase tracking-wider text-[#266b75]">Your Info</p>
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
      {data.goals && (
        <div className={sectionCls + " space-y-2"}>
          <p className="text-xs font-bold uppercase tracking-wider text-[#266b75]">Goals</p>
          <p className="text-slate-700 whitespace-pre-line">{data.goals}</p>
          {data.other_notes && <p className="text-slate-500 italic whitespace-pre-line">{data.other_notes}</p>}
        </div>
      )}
      <div className={sectionCls + " space-y-2"}>
        <p className="text-xs font-bold uppercase tracking-wider text-[#266b75]">Portal Access</p>
        <Row label="Login email" value={data.portal_email || data.email} />
        <Row label="Password" value="••••••••" />
      </div>
    </div>
  );
}

// ─── Step config ──────────────────────────────────────────────────────────────

function buildSteps(services: Services | "") {
  const hasBK = services === "bookkeeping" || services === "both";
  const hasVA = services === "va" || services === "both";
  return [
    { id: 1, label: "Services",    show: true },
    { id: 2, label: "Your Info",   show: true },
    { id: 3, label: "Bookkeeping", show: hasBK },
    { id: 4, label: "VA Details",  show: hasVA },
    { id: 5, label: "Access",      show: true },
    { id: 6, label: "Goals",       show: true },
    { id: 7, label: "Portal",      show: true },
    { id: 8, label: "Review",      show: true },
  ].filter(s => s.show);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type PageState = "loading" | "error" | "form" | "done";

export default function PublicOnboarding() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";

  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [data, setData] = useState<FormData>(EMPTY);
  const [stepId, setStepId] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const set = useCallback((k: keyof FormData, v: any) => setData(d => ({ ...d, [k]: v })), []);

  useEffect(() => {
    if (!token) { setPageState("error"); setErrorMsg("No onboarding token found in this link."); return; }
    fetch(`/api/onboarding/${token}`)
      .then(async r => {
        const json = await r.json().catch(() => ({}));
        if (!r.ok) { setErrorMsg(json.error ?? "This link is invalid or has expired."); setPageState("error"); return; }
        const { client, onboarding_data } = json;
        setData(d => ({
          ...d,
          services: (onboarding_data?.services as Services) || "",
          name: client.name || "",
          contact_name: client.contact_name || "",
          email: client.email || "",
          phone: client.phone || "",
          portal_email: client.email || "",
          industry: onboarding_data?.industry || "",
          bk_software: onboarding_data?.bk_software || "",
          bk_existing_accounts: onboarding_data?.bk_existing_accounts || "",
          bk_fiscal_year_end: onboarding_data?.bk_fiscal_year_end || "",
          bk_accounting_basis: onboarding_data?.bk_accounting_basis || "",
          bk_business_bank_account: onboarding_data?.bk_business_bank_account || "",
          bk_notes: onboarding_data?.bk_notes || "",
          va_task_types: onboarding_data?.va_task_types || [],
          va_tools: onboarding_data?.va_tools || "",
          va_communication: onboarding_data?.va_communication || "",
          va_availability: onboarding_data?.va_availability || "",
          access_notes: onboarding_data?.access_notes || "",
          goals: onboarding_data?.goals || "",
          other_notes: onboarding_data?.other_notes || "",
        }));
        setPageState("form");
      })
      .catch(() => { setErrorMsg("Unable to load onboarding form. Please try again."); setPageState("error"); });
  }, [token]);

  const steps = buildSteps(data.services);
  const currentIdx = steps.findIndex(s => s.id === stepId);
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === steps.length - 1;

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 4000); };

  const goNext = () => {
    if (stepId === 1 && !data.services) { showToast("Please select a service"); return; }
    if (stepId === 2 && !data.email) { showToast("Email address is required"); return; }
    if (stepId === 7) {
      if (!data.portal_email && !data.email) { showToast("Please enter your portal email"); return; }
      if (!data.portal_password || data.portal_password.length < 8) { showToast("Password must be at least 8 characters"); return; }
      if (data.portal_password !== data.portal_password_confirm) { showToast("Passwords do not match"); return; }
    }
    const next = steps[currentIdx + 1];
    if (next) setStepId(next.id);
  };

  const goPrev = () => {
    const prev = steps[currentIdx - 1];
    if (prev) setStepId(prev.id);
  };

  const handleSubmit = async () => {
    if (!data.email || !data.services) { showToast("Email address and service type are required"); return; }
    if (!data.portal_password || data.portal_password.length < 8) { showToast("Password must be at least 8 characters"); return; }
    if (data.portal_password !== data.portal_password_confirm) { showToast("Passwords do not match"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/onboarding/${token}/submit`, {
        method: "POST",
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
          portal_email: data.portal_email || data.email,
          portal_password: data.portal_password,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Submission failed");
      setPageState("done");
    } catch (err: any) {
      showToast(err.message ?? "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (pageState === "loading") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#266b75] animate-spin" />
      </div>
    );
  }

  if (pageState === "error") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <X className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Link Invalid or Expired</h2>
          <p className="text-slate-500 text-sm">{errorMsg}</p>
          <p className="text-slate-400 text-xs mt-4">Please contact HM Virtual Services for a new onboarding link.</p>
        </div>
      </div>
    );
  }

  if (pageState === "done") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Onboarding Complete!</h2>
          <p className="text-slate-500 text-sm mb-4">Thank you for completing your onboarding form. Your client portal has been activated.</p>
          <div className="bg-[#266b75]/8 border border-[#266b75]/20 rounded-xl px-5 py-4 text-sm text-[#266b75] text-left space-y-1">
            <p className="font-semibold mb-2">You can now log into your portal to:</p>
            <p>• Upload documents</p>
            <p>• View invoices</p>
            <p>• Track tasks</p>
            <p>• Communicate with HM Virtual Services</p>
          </div>
          <p className="text-xs text-slate-400 mt-4">A confirmation email has been sent to {data.portal_email || data.email}.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-[#266b75]" style={{ letterSpacing: "-0.3px" }}>HM Virtual Services</div>
            <p className="text-xs text-slate-400 mt-0.5">Client Onboarding — Step {currentIdx + 1} of {steps.length}: {steps[currentIdx]?.label}</p>
          </div>
          <div className="text-right">
            <div className="flex gap-1">
              {steps.map((s, i) => (
                <div key={s.id} className={`h-1.5 w-6 rounded-full transition-all ${i <= currentIdx ? "bg-[#266b75]" : "bg-slate-200"}`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          <motion.div key={stepId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
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
      </div>

      {/* Footer nav */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={goPrev} disabled={isFirst}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-4 py-2 rounded-xl hover:bg-slate-100">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {isLast ? (
            <button onClick={handleSubmit} disabled={submitting}
              className="flex items-center gap-2 bg-[#266b75] hover:bg-[#1d5159] text-white font-semibold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-60">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {submitting ? "Submitting…" : "Submit"}
            </button>
          ) : (
            <button onClick={goNext}
              className="flex items-center gap-1.5 bg-[#266b75] hover:bg-[#1d5159] text-white font-semibold px-5 py-2.5 rounded-xl transition-colors">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Simple toast */}
      {toastMsg && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg z-50 max-w-sm text-center">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

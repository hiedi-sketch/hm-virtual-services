import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Phone, Mail, StickyNote, Calendar, Plus,
  ChevronDown, ChevronUp, Edit3, Loader2, X, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

type AnyLead = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  cell_phone?: string | null;
  business_name?: string | null;
  client_id?: number | null;
  title?: string | null;
  management_level?: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  linkedin_url?: string | null;
  website?: string | null;
  facebook_url?: string | null;
  x_url?: string | null;
  company_size?: string | null;
  revenue?: string | null;
  founded_year?: string | null;
  estimated_value?: number | null;
  status: string;
  lead_source?: string | null;
  notes?: string | null;
  follow_up_date?: string | null;
  stage?: string | null;
  overall_status?: string | null;
  reply_type?: string | null;
  priority?: string | null;
  call_attempts?: number | null;
  last_call_date?: string | null;
  last_call_outcome?: string | null;
  next_follow_up_type?: string | null;
  email_sequence_name?: string | null;
  email_stage?: string | null;
  personalization_notes?: string | null;
  lead_owner?: string | null;
  created_at?: string | null;
};

type ActivityType = "call" | "email" | "note" | "follow_up";

type Activity = {
  id: number;
  lead_id: number;
  type: ActivityType;
  notes: string | null;
  outcome: string | null;
  scheduled_date: string | null;
  follow_up_type: string | null;
  created_at: string | null;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const STAGE_OPTIONS = [
  { value: "new", label: "New Lead" },
  { value: "contacted", label: "Contacted" },
  { value: "in_progress", label: "In Progress" },
  { value: "qualified", label: "Qualified" },
  { value: "disqualified", label: "Disqualified" },
];

const STAGE_COLORS: Record<string, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  contacted: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-violet-50 text-violet-700 border-violet-200",
  qualified: "bg-emerald-50 text-emerald-700 border-emerald-200",
  disqualified: "bg-red-50 text-red-700 border-red-200",
};

const LEAD_SOURCE_OPTIONS = ["Cold List", "Referral", "Bark", "Thumbtack", "Website", "Other"];
const OVERALL_STATUS_OPTIONS = ["Untouched", "In Progress", "Responded", "Converted", "Dead"];
const REPLY_TYPE_OPTIONS = ["Interested", "Not Now", "Unsubscribe", "Wrong Fit", "N/A"];
const PRIORITY_OPTIONS = ["Hot", "Warm", "Cold"];
const CALL_OUTCOME_OPTIONS = ["No Answer", "Left Voicemail", "Spoke With", "Wrong Number"];

const PRIORITY_COLORS: Record<string, string> = {
  Hot: "bg-red-50 text-red-700 border-red-200",
  Warm: "bg-orange-50 text-orange-700 border-orange-200",
  Cold: "bg-sky-50 text-sky-700 border-sky-200",
};

const OVERALL_STATUS_COLORS: Record<string, string> = {
  Untouched: "bg-slate-100 text-slate-600 border-slate-200",
  "In Progress": "bg-yellow-50 text-yellow-700 border-yellow-200",
  Responded: "bg-blue-50 text-blue-700 border-blue-200",
  Converted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Dead: "bg-red-50 text-red-700 border-red-200",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

function fmtDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return (
      d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " · " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    );
  } catch {
    return "";
  }
}

function stageLabel(s: string | null | undefined) {
  return STAGE_OPTIONS.find(o => o.value === (s ?? "new"))?.label ?? "New Lead";
}

function initials(name: string) {
  return name
    .split(" ")
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ─── InlineField ─────────────────────────────────────────────────────────────

interface InlineFieldProps {
  value?: string | number | null;
  onSave: (val: string | null) => void;
  type?: "text" | "email" | "tel" | "date" | "number" | "textarea" | "select";
  options?: string[];
  placeholder?: string;
  readOnly?: boolean;
}

function InlineField({
  value, onSave, type = "text", options, placeholder = "—", readOnly,
}: InlineFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));

  const start = () => {
    if (readOnly) return;
    setDraft(String(value ?? ""));
    setEditing(true);
  };

  const save = () => {
    onSave(draft.trim() || null);
    setEditing(false);
  };

  if (editing) {
    const cls =
      "w-full text-sm border border-[#266b75]/50 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#266b75]/50 bg-white";
    if (options) {
      return (
        <select
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          autoFocus
          className={cls}
        >
          <option value="">—</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (type === "textarea") {
      return (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          autoFocus
          rows={3}
          placeholder={placeholder}
          className={cn(cls, "resize-none")}
        />
      );
    }
    return (
      <input
        type={type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
        placeholder={placeholder}
        className={cls}
      />
    );
  }

  const display = value != null && value !== "" ? String(value) : null;
  return (
    <button
      onClick={start}
      disabled={readOnly}
      className={cn(
        "w-full text-left text-sm rounded-lg px-2.5 py-1.5 transition-colors group",
        readOnly ? "cursor-default" : "hover:bg-slate-50",
        display ? "text-slate-800" : "text-slate-400 italic",
      )}
    >
      <span className="flex items-center justify-between gap-1.5">
        <span className="truncate">{display || placeholder}</span>
        {!readOnly && (
          <Edit3 className="w-3 h-3 text-slate-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </span>
    </button>
  );
}

// ─── PropRow ─────────────────────────────────────────────────────────────────

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0 w-32 pt-2">
        {label}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────

function Section({
  title, children, defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/80 transition-colors"
      >
        <span className="text-xs font-bold text-slate-500 uppercase tracking-[0.1em]">{title}</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-slate-400" />
          : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-slate-50">{children}</div>
      )}
    </div>
  );
}

// ─── ActivityItem ─────────────────────────────────────────────────────────────

const ACTIVITY_CFG: Record<ActivityType, { label: string; bg: string; iconColor: string }> = {
  call: { label: "Call", bg: "bg-blue-50", iconColor: "text-blue-600" },
  email: { label: "Email", bg: "bg-violet-50", iconColor: "text-violet-600" },
  note: { label: "Note", bg: "bg-amber-50", iconColor: "text-amber-600" },
  follow_up: { label: "Follow-Up", bg: "bg-emerald-50", iconColor: "text-emerald-600" },
};

const ACTIVITY_ICONS: Record<ActivityType, React.ElementType> = {
  call: Phone,
  email: Mail,
  note: StickyNote,
  follow_up: Calendar,
};

function ActivityItem({ activity }: { activity: Activity }) {
  const cfg = ACTIVITY_CFG[activity.type] ?? ACTIVITY_CFG.note;
  const Icon = ACTIVITY_ICONS[activity.type] ?? StickyNote;
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", cfg.bg)}>
          <Icon className={cn("w-4 h-4", cfg.iconColor)} />
        </div>
        <div className="w-px flex-1 bg-slate-100 mt-1 min-h-[8px]" />
      </div>
      <div className="pb-5 flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-slate-800">{cfg.label}</span>
          <span className="text-xs text-slate-400 shrink-0">{timeAgo(activity.created_at)}</span>
        </div>
        {activity.outcome && (
          <span className="inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {activity.outcome}
          </span>
        )}
        {activity.scheduled_date && (
          <p className="text-xs text-slate-500 mt-1">
            Scheduled: {fmtDate(activity.scheduled_date)}
            {activity.follow_up_type ? ` · ${activity.follow_up_type}` : ""}
          </p>
        )}
        {activity.notes && (
          <p className="text-sm text-slate-600 mt-1.5 whitespace-pre-wrap leading-relaxed">{activity.notes}</p>
        )}
        <p className="text-xs text-slate-400 mt-2">{fmtDateTime(activity.created_at)}</p>
      </div>
    </div>
  );
}

// ─── ActivityModal ─────────────────────────────────────────────────────────────

type ActivityPayload = {
  type: ActivityType;
  notes?: string | null;
  outcome?: string | null;
  scheduled_date?: string | null;
  follow_up_type?: string | null;
};

function ActivityModal({
  type, onClose, onSubmit, isSubmitting,
}: {
  type: ActivityType;
  onClose: () => void;
  onSubmit: (data: ActivityPayload) => void;
  isSubmitting: boolean;
}) {
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [followUpType, setFollowUpType] = useState("Call");

  const TITLES: Record<ActivityType, string> = {
    call: "Log a Call",
    email: "Log an Email",
    note: "Add a Note",
    follow_up: "Schedule Follow-Up",
  };
  const PLACEHOLDERS: Record<ActivityType, string> = {
    call: "What was discussed on the call?",
    email: "What was the email about?",
    note: "Add a note about this lead…",
    follow_up: "Any notes about this follow-up…",
  };

  const handleSubmit = () => {
    onSubmit({
      type,
      notes: notes.trim() || null,
      outcome: outcome || null,
      scheduled_date: scheduledDate || null,
      follow_up_type: followUpType || null,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">{TITLES[type]}</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {type === "call" && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Call Outcome
              </label>
              <select
                value={outcome}
                onChange={e => setOutcome(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#266b75]"
              >
                <option value="">Select outcome…</option>
                {CALL_OUTCOME_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          )}
          {type === "follow_up" && (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Follow-Up Type
                </label>
                <select
                  value={followUpType}
                  onChange={e => setFollowUpType(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#266b75]"
                >
                  <option value="Call">Call</option>
                  <option value="Email">Email</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Scheduled Date
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#266b75]"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              placeholder={PLACEHOLDERS[type]}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-[#266b75]"
            />
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-5 py-2 text-sm font-medium text-white rounded-xl flex items-center gap-2 transition-opacity disabled:opacity-50"
            style={{ background: "#266b75" }}
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isSubmitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function LeadDetail() {
  const params = useParams<{ id: string }>();
  const leadId = Number(params.id);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeModal, setActiveModal] = useState<ActivityType | null>(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setShowActionMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: lead, isLoading } = useQuery<AnyLead>({
    queryKey: ["lead", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Lead not found");
      return res.json();
    },
    enabled: !isNaN(leadId),
  });

  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: ["lead-activities", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/activities`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !isNaN(leadId),
  });

  const updateField = useCallback(
    async (field: string, value: string | number | null) => {
      try {
        await fetch(`/api/leads/${leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ [field]: value }),
        });
        queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
        queryClient.invalidateQueries({ queryKey: ["leads"] });
      } catch {
        toast({ title: "Failed to save change", variant: "destructive" });
      }
    },
    [leadId, queryClient, toast],
  );

  const { mutate: logActivity, isPending: isLogging } = useMutation({
    mutationFn: async (data: ActivityPayload) => {
      const res = await fetch(`/api/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to log activity");
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["lead-activities", leadId] });
      setActiveModal(null);
      if (vars.type === "call") {
        updateField("call_attempts", (lead?.call_attempts ?? 0) + 1);
        if (vars.outcome) updateField("last_call_outcome", vars.outcome);
        updateField("last_call_date", new Date().toISOString().split("T")[0]);
      }
      if (vars.type === "follow_up") {
        if (vars.scheduled_date) updateField("follow_up_date", vars.scheduled_date);
        if (vars.follow_up_type) updateField("next_follow_up_type", vars.follow_up_type);
      }
      toast({ title: "Activity logged" });
    },
    onError: () => toast({ title: "Failed to log activity", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-[#266b75]" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-slate-500">Lead not found.</p>
        <button
          onClick={() => navigate("/leads")}
          className="text-sm text-[#266b75] hover:underline"
        >
          ← Back to Leads
        </button>
      </div>
    );
  }

  const stageValue = lead.stage ?? "new";
  const stageColor = STAGE_COLORS[stageValue] ?? STAGE_COLORS.new;
  const overallStatusColor =
    OVERALL_STATUS_COLORS[lead.overall_status ?? "Untouched"] ?? OVERALL_STATUS_COLORS.Untouched;
  const priorityColor = PRIORITY_COLORS[lead.priority ?? ""] ?? "";

  const actionItems: { type: ActivityType; label: string; Icon: React.ElementType }[] = [
    { type: "call", label: "Log Call", Icon: Phone },
    { type: "email", label: "Log Email", Icon: Mail },
    { type: "note", label: "Add Note", Icon: StickyNote },
    { type: "follow_up", label: "Schedule Follow-Up", Icon: Calendar },
  ];

  const quickBtns: { type: ActivityType; label: string; Icon: React.ElementType; cls: string }[] = [
    { type: "call", label: "Log Call", Icon: Phone, cls: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
    { type: "email", label: "Log Email", Icon: Mail, cls: "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100" },
    { type: "note", label: "Add Note", Icon: StickyNote, cls: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
    { type: "follow_up", label: "Follow-Up", Icon: Calendar, cls: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc]">

      {/* ── Header ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 py-3.5">

            {/* Back */}
            <button
              onClick={() => navigate("/leads")}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#266b75] transition-colors shrink-0 group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline font-medium">CRM Leads</span>
            </button>

            <div className="w-px h-5 bg-slate-200 shrink-0" />

            {/* Avatar + Name */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                style={{ background: "linear-gradient(135deg, #266b75, #7dbdc6)" }}
              >
                {initials(lead.name)}
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-slate-900 truncate">{lead.name}</h1>
                {lead.business_name && (
                  <p className="text-xs text-slate-500 truncate">{lead.business_name}</p>
                )}
              </div>
            </div>

            {/* Stage dropdown */}
            <div className="shrink-0">
              <select
                value={stageValue}
                onChange={e => updateField("stage", e.target.value)}
                className={cn(
                  "text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer",
                  "focus:outline-none focus:ring-2 focus:ring-[#266b75]/20 transition-all",
                  stageColor,
                )}
              >
                {STAGE_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Owner + Created (desktop only) */}
            <div className="hidden lg:flex items-center gap-3 text-xs text-slate-500 shrink-0">
              <span className="font-medium text-slate-700">{lead.lead_owner ?? "HM Virtual Services"}</span>
              {lead.created_at && <span>· {fmtDate(lead.created_at)}</span>}
            </div>

            {/* Log Activity */}
            <div className="relative shrink-0" ref={actionMenuRef}>
              <button
                onClick={() => setShowActionMenu(o => !o)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white rounded-xl transition-colors"
                style={{ background: "#266b75" }}
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Log Activity</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showActionMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-50">
                  {actionItems.map(a => (
                    <button
                      key={a.type}
                      onClick={() => { setActiveModal(a.type); setShowActionMenu(false); }}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <a.Icon className="w-4 h-4 text-slate-400" />
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6 max-w-7xl mx-auto">

          {/* Left: Activity Feed */}
          <div className="space-y-4">

            {/* Quick actions */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400 mb-3">Quick Actions</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {quickBtns.map(b => (
                  <button
                    key={b.type}
                    onClick={() => setActiveModal(b.type)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 px-3 py-2.5",
                      "text-sm font-medium rounded-xl border transition-colors",
                      b.cls,
                    )}
                  >
                    <b.Icon className="w-4 h-4" />
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400 mb-4">
                Activity Timeline
                {activities.length > 0 && (
                  <span className="ml-2 text-slate-300 font-normal normal-case">
                    ({activities.length})
                  </span>
                )}
              </p>
              {activities.length === 0 ? (
                <div className="py-10 flex flex-col items-center gap-3 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">No activity yet</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Log a call, email, or note to get started.
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  {activities.map(a => <ActivityItem key={a.id} activity={a} />)}
                </div>
              )}
            </div>
          </div>

          {/* Right: Property Sections */}
          <div className="space-y-4">

            {/* ── Lead Info ── */}
            <Section title="Lead Info">
              <PropRow label="Stage">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5">
                  <span className={cn(
                    "text-xs font-semibold px-2 py-0.5 rounded-full border",
                    stageColor,
                  )}>
                    {stageLabel(lead.stage)}
                  </span>
                </div>
              </PropRow>
              <PropRow label="Lead Source">
                <InlineField
                  value={lead.lead_source}
                  onSave={v => updateField("lead_source", v)}
                  options={LEAD_SOURCE_OPTIONS}
                  placeholder="Select source"
                />
              </PropRow>
              <PropRow label="Overall Status">
                <div>
                  <InlineField
                    value={lead.overall_status}
                    onSave={v => updateField("overall_status", v)}
                    options={OVERALL_STATUS_OPTIONS}
                    placeholder="Untouched"
                  />
                  {lead.overall_status && (
                    <span className={cn(
                      "ml-2.5 inline-block text-xs font-medium px-2 py-0.5 rounded-full border",
                      overallStatusColor,
                    )}>
                      {lead.overall_status}
                    </span>
                  )}
                </div>
              </PropRow>
              <PropRow label="Reply Type">
                <InlineField
                  value={lead.reply_type}
                  onSave={v => updateField("reply_type", v)}
                  options={REPLY_TYPE_OPTIONS}
                />
              </PropRow>
              <PropRow label="Priority">
                <div>
                  <InlineField
                    value={lead.priority}
                    onSave={v => updateField("priority", v)}
                    options={PRIORITY_OPTIONS}
                  />
                  {lead.priority && (
                    <span className={cn(
                      "ml-2.5 inline-block text-xs font-medium px-2 py-0.5 rounded-full border",
                      priorityColor,
                    )}>
                      {lead.priority}
                    </span>
                  )}
                </div>
              </PropRow>
              <PropRow label="Lead Owner">
                <InlineField
                  value={lead.lead_owner}
                  onSave={v => updateField("lead_owner", v)}
                  placeholder="HM Virtual Services"
                />
              </PropRow>
              <PropRow label="Est. Value">
                <InlineField
                  value={lead.estimated_value != null ? String(lead.estimated_value) : ""}
                  type="number"
                  onSave={v => updateField("estimated_value", v ? Number(v) : null)}
                  placeholder="$0"
                />
              </PropRow>
            </Section>

            {/* ── Contact Info ── */}
            <Section title="Contact Info">
              <PropRow label="Name">
                <InlineField
                  value={lead.name}
                  onSave={v => { if (v) updateField("name", v); }}
                  placeholder="Full name"
                />
              </PropRow>
              <PropRow label="Business">
                <InlineField
                  value={lead.business_name}
                  onSave={v => updateField("business_name", v)}
                  placeholder="Company name"
                />
              </PropRow>
              <PropRow label="Title">
                <InlineField
                  value={lead.title}
                  onSave={v => updateField("title", v)}
                  placeholder="Job title"
                />
              </PropRow>
              <PropRow label="Email">
                <InlineField
                  value={lead.email}
                  type="email"
                  onSave={v => updateField("email", v)}
                  placeholder="email@example.com"
                />
              </PropRow>
              <PropRow label="Phone">
                <InlineField
                  value={lead.phone}
                  type="tel"
                  onSave={v => updateField("phone", v)}
                  placeholder="+1 (555) 000-0000"
                />
              </PropRow>
              <PropRow label="Cell Phone">
                <InlineField
                  value={lead.cell_phone}
                  type="tel"
                  onSave={v => updateField("cell_phone", v)}
                  placeholder="+1 (555) 000-0000"
                />
              </PropRow>
              <PropRow label="City">
                <InlineField
                  value={lead.city}
                  onSave={v => updateField("city", v)}
                  placeholder="City"
                />
              </PropRow>
              <PropRow label="State">
                <InlineField
                  value={lead.state}
                  onSave={v => updateField("state", v)}
                  placeholder="ST"
                />
              </PropRow>
            </Section>

            {/* ── Outreach Info ── */}
            <Section title="Outreach Info">
              <PropRow label="Sequence">
                <InlineField
                  value={lead.email_sequence_name}
                  onSave={v => updateField("email_sequence_name", v)}
                  placeholder="Sequence name"
                />
              </PropRow>
              <PropRow label="Email Stage">
                <InlineField
                  value={lead.email_stage}
                  onSave={v => updateField("email_stage", v)}
                  placeholder="Stage #"
                />
              </PropRow>
              <PropRow label="Call Attempts">
                <div className="flex items-center gap-2 px-2.5 py-1.5">
                  <span className="text-sm font-bold text-slate-800 min-w-[1.5rem] text-center">
                    {lead.call_attempts ?? 0}
                  </span>
                  <button
                    onClick={() => updateField("call_attempts", (lead.call_attempts ?? 0) + 1)}
                    className="flex items-center gap-1 text-xs font-semibold text-[#266b75] border border-[#266b75]/30 rounded-lg px-2 py-1 hover:bg-[#266b75]/5 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    +1
                  </button>
                </div>
              </PropRow>
              <PropRow label="Last Call">
                <InlineField
                  value={lead.last_call_date}
                  type="date"
                  onSave={v => updateField("last_call_date", v)}
                />
              </PropRow>
              <PropRow label="Last Outcome">
                <InlineField
                  value={lead.last_call_outcome}
                  onSave={v => updateField("last_call_outcome", v)}
                  options={CALL_OUTCOME_OPTIONS}
                />
              </PropRow>
              <PropRow label="Follow-Up Date">
                <InlineField
                  value={lead.follow_up_date}
                  type="date"
                  onSave={v => updateField("follow_up_date", v)}
                />
              </PropRow>
              <PropRow label="Follow-Up Type">
                <InlineField
                  value={lead.next_follow_up_type}
                  onSave={v => updateField("next_follow_up_type", v)}
                  options={["Call", "Email"]}
                />
              </PropRow>
            </Section>

            {/* ── Online Presence ── */}
            <Section title="Online Presence" defaultOpen={false}>
              <PropRow label="LinkedIn">
                <div className="flex items-center gap-1">
                  <InlineField
                    value={lead.linkedin_url}
                    onSave={v => updateField("linkedin_url", v)}
                    placeholder="https://linkedin.com/in/…"
                  />
                  {lead.linkedin_url && (
                    <a
                      href={lead.linkedin_url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open LinkedIn profile"
                      onClick={e => e.stopPropagation()}
                      className="text-slate-400 hover:text-slate-600 transition-colors p-1 shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </PropRow>
              <PropRow label="Website">
                <div className="flex items-center gap-1">
                  <InlineField
                    value={lead.website}
                    onSave={v => updateField("website", v)}
                    placeholder="https://example.com"
                  />
                  {lead.website && (
                    <a
                      href={lead.website}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open website"
                      onClick={e => e.stopPropagation()}
                      className="text-slate-400 hover:text-slate-600 transition-colors p-1 shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </PropRow>
              <PropRow label="Facebook">
                <InlineField
                  value={lead.facebook_url}
                  onSave={v => updateField("facebook_url", v)}
                  placeholder="https://facebook.com/…"
                />
              </PropRow>
              <PropRow label="X / Twitter">
                <InlineField
                  value={lead.x_url}
                  onSave={v => updateField("x_url", v)}
                  placeholder="https://x.com/…"
                />
              </PropRow>
              <PropRow label="Industry">
                <InlineField
                  value={lead.industry}
                  onSave={v => updateField("industry", v)}
                  placeholder="Industry"
                />
              </PropRow>
              <PropRow label="Company Size">
                <InlineField
                  value={lead.company_size}
                  onSave={v => updateField("company_size", v)}
                  placeholder="e.g. 10–50"
                />
              </PropRow>
              <PropRow label="Revenue">
                <InlineField
                  value={lead.revenue}
                  onSave={v => updateField("revenue", v)}
                  placeholder="Annual revenue"
                />
              </PropRow>
              <PropRow label="Founded">
                <InlineField
                  value={lead.founded_year}
                  onSave={v => updateField("founded_year", v)}
                  placeholder="Year"
                />
              </PropRow>
            </Section>

            {/* ── Notes ── */}
            <Section title="Notes">
              <PropRow label="Personalization">
                <InlineField
                  value={lead.personalization_notes}
                  type="textarea"
                  onSave={v => updateField("personalization_notes", v)}
                  placeholder="Personalization notes for outreach…"
                />
              </PropRow>
              <PropRow label="General">
                <InlineField
                  value={lead.notes}
                  type="textarea"
                  onSave={v => updateField("notes", v)}
                  placeholder="General notes…"
                />
              </PropRow>
            </Section>

          </div>
        </div>
      </div>

      {/* Activity modal */}
      {activeModal && (
        <ActivityModal
          type={activeModal}
          onClose={() => setActiveModal(null)}
          onSubmit={data => logActivity(data)}
          isSubmitting={isLogging}
        />
      )}
    </div>
  );
}

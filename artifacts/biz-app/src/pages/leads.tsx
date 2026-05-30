import { useState, useRef, useEffect } from "react";
import {
  useListLeads,
  useListClients,
  useCreateLead,
  useUpdateLead,
  useDeleteLead,
  getListLeadsQueryKey,
  LeadStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Upload, Target, Mail, TrendingUp, Users, CheckCircle, Trash2, ChevronRight, StickyNote, Calendar, FileSpreadsheet, AlertCircle, Link2, X, UserCheck, Phone, Globe, Building2, MapPin, ExternalLink, DollarSign, ChevronLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── CSV Import ────────────────────────────────────────────────────────────────

type CsvLead = {
  name: string;
  email?: string;
  phone?: string;
  cell_phone?: string;
  business_name?: string;
  title?: string;
  management_level?: string;
  industry?: string;
  city?: string;
  state?: string;
  linkedin_url?: string;
  website?: string;
  facebook_url?: string;
  x_url?: string;
  notes?: string;
  company_size?: string;
  revenue?: string;
  founded_year?: string;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (c === "," && !inQuote) {
      result.push(current); current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

function parseCsv(text: string): CsvLead[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const idx = (key: string) => headers.indexOf(key.toLowerCase());
  const get = (row: string[], ...keys: string[]) => {
    for (const k of keys) {
      const i = idx(k);
      if (i !== -1) { const v = row[i]?.trim(); if (v) return v; }
    }
    return undefined;
  };
  return lines.slice(1).map(line => {
    const row = parseCsvLine(line);
    const firstName = get(row, "first name") ?? "";
    const lastName = get(row, "last name") ?? "";
    const name = [firstName, lastName].filter(Boolean).join(" ").trim();
    if (!name && !get(row, "email")) return null;
    return {
      name: name || "Unknown",
      email: get(row, "email"),
      phone: get(row, "biz phone"),
      cell_phone: get(row, "cell phone"),
      business_name: get(row, "company"),
      title: get(row, "title"),
      management_level: get(row, "management level"),
      industry: get(row, "industry"),
      city: get(row, "city"),
      state: get(row, "state"),
      linkedin_url: get(row, "linkedin profile"),
      website: get(row, "website"),
      facebook_url: get(row, "facebook profile"),
      x_url: get(row, "x profile"),
      notes: get(row, "description"),
      company_size: get(row, "company size"),
      revenue: get(row, "revenue"),
      founded_year: get(row, "founded year"),
    } satisfies CsvLead;
  }).filter((r): r is CsvLead => r !== null);
}

// ─────────────────────────────────────────────────────────────────────────────

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  estimated_value: z.coerce.number().optional().nullable(),
  status: z.nativeEnum(LeadStatus).default("new"),
  lead_source: z.string().optional(),
  notes: z.string().optional(),
  follow_up_date: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const STATUSES: {
  value: LeadStatus;
  label: string;
  color: string;
  dot: string;
  col: string;
  pill: string;
  activeBar: string;
}[] = [
  {
    value: "new",
    label: "New",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    col: "border-blue-200",
    pill: "bg-blue-50 text-blue-700 border-blue-200",
    activeBar: "bg-blue-500",
  },
  {
    value: "contacted",
    label: "Contacted",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    col: "border-amber-200",
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    activeBar: "bg-amber-500",
  },
  {
    value: "proposal",
    label: "Proposal",
    color: "bg-violet-100 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
    col: "border-violet-200",
    pill: "bg-violet-50 text-violet-700 border-violet-200",
    activeBar: "bg-violet-500",
  },
  {
    value: "closed",
    label: "Closed",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    col: "border-emerald-200",
    pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
    activeBar: "bg-emerald-500",
  },
];

const STATUS_ORDER = STATUSES.map(s => s.value);

function StatusTimeline({
  currentStatus,
  onSetStatus,
  isPending,
}: {
  currentStatus: LeadStatus;
  onSetStatus: (s: LeadStatus) => void;
  isPending: boolean;
}) {
  const currentIdx = STATUS_ORDER.indexOf(currentStatus);
  return (
    <div className="flex items-center gap-0.5">
      {STATUSES.map((s, idx) => {
        const past = idx < currentIdx;
        const active = idx === currentIdx;
        const future = idx > currentIdx;
        return (
          <div key={s.value} className="flex items-center flex-1 min-w-0">
            <button
              onClick={() => currentStatus !== s.value && onSetStatus(s.value)}
              disabled={isPending}
              title={s.label}
              className={cn(
                "flex-1 h-1.5 rounded-full transition-all",
                past ? "bg-slate-300 hover:bg-slate-400" :
                active ? s.activeBar :
                "bg-slate-100 hover:bg-slate-200"
              )}
            />
            {idx < STATUSES.length - 1 && (
              <ChevronRight className={cn(
                "w-3 h-3 shrink-0 mx-0.5",
                future ? "text-slate-200" : "text-slate-400"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function LeadNotes({
  leadId,
  notes,
}: {
  leadId: number;
  notes: string | null | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateMutation = useUpdateLead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
      },
      onError: () => {
        toast({ title: "Failed to save notes", variant: "destructive" });
      },
    },
  });

  const startEdit = () => {
    setDraft(notes ?? "");
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed !== (notes ?? "").trim()) {
      updateMutation.mutate({ id: leadId, data: { notes: trimmed || null } });
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="mt-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === "Escape") { setEditing(false); setDraft(notes ?? ""); } }}
          rows={3}
          placeholder="Add notes about this lead…"
          className="w-full text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:border-blue-400 placeholder:text-slate-300"
        />
        <p className="text-[10px] text-slate-400 mt-0.5">Blur or Escape to finish</p>
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className={cn(
        "mt-2 w-full text-left text-xs rounded-lg px-2.5 py-2 border transition-colors",
        notes
          ? "bg-amber-50 border-amber-100 text-slate-700 hover:border-amber-300"
          : "bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-200"
      )}
    >
      <span className="flex items-start gap-1.5">
        <StickyNote className="w-3 h-3 shrink-0 mt-0.5 text-slate-400" />
        <span className="line-clamp-3 whitespace-pre-wrap">{notes || "Add notes…"}</span>
      </span>
    </button>
  );
}

// ── Lead → Client linker ──────────────────────────────────────────────────────

type ClientOption = { id: number; name: string; is_active: boolean };

function LeadClientLink({
  leadId,
  clientId,
  clients,
}: {
  leadId: number;
  clientId: number | null | undefined;
  clients: ClientOption[];
}) {
  const [picking, setPicking] = useState(false);
  const queryClient = useQueryClient();

  const updateMutation = useUpdateLead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        setPicking(false);
      },
    },
  });

  const linked = clients.find(c => c.id === clientId);
  const active = clients.filter(c => c.is_active).sort((a, b) => a.name.localeCompare(b.name));
  const inactive = clients.filter(c => !c.is_active).sort((a, b) => a.name.localeCompare(b.name));

  const link = (id: number | null) =>
    updateMutation.mutate({ id: leadId, data: { client_id: id } });

  if (linked) {
    return (
      <div className="flex items-center gap-1.5 bg-[#266b75]/8 border border-[#266b75]/20 rounded-lg px-2.5 py-1.5">
        <UserCheck className="w-3 h-3 text-[#266b75] shrink-0" />
        <span className="text-xs font-medium text-[#266b75] truncate flex-1">{linked.name}</span>
        {!linked.is_active && (
          <span className="text-[10px] bg-slate-100 text-slate-500 px-1 rounded">inactive</span>
        )}
        <button
          onClick={() => link(null)}
          disabled={updateMutation.isPending}
          className="shrink-0 text-slate-400 hover:text-red-500 transition-colors"
          title="Unlink client"
          aria-label="Unlink client"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  if (picking) {
    return (
      <div className="flex items-center gap-1.5">
        <select
          autoFocus
          className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#266b75]"
          defaultValue=""
          onChange={e => { if (e.target.value) link(Number(e.target.value)); }}
          onBlur={() => setPicking(false)}
        >
          <option value="" disabled>Select a client…</option>
          {active.length > 0 && (
            <optgroup label="Active">
              {active.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          )}
          {inactive.length > 0 && (
            <optgroup label="Inactive">
              {inactive.map(c => <option key={c.id} value={c.id}>{c.name} (inactive)</option>)}
            </optgroup>
          )}
        </select>
        <button onClick={() => setPicking(false)} className="text-slate-400 hover:text-slate-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setPicking(true)}
      className="w-full flex items-center gap-1.5 text-xs text-slate-400 hover:text-[#266b75] border border-dashed border-slate-200 hover:border-[#266b75]/40 rounded-lg px-2.5 py-1.5 transition-colors"
    >
      <Link2 className="w-3 h-3 shrink-0" />
      Link a client…
    </button>
  );
}

// ── Lead Detail Panel ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LeadDetailPanel({ lead, clients, onClose, onSetStatus, isPending }: {
  lead: any;
  clients: ClientOption[];
  onClose: () => void;
  onSetStatus: (id: number, status: LeadStatus) => void;
  isPending: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateMutation = useUpdateLead({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() }),
      onError:   () => toast({ title: "Failed to save", variant: "destructive" }),
    },
  });

  // Follow-up date inline edit
  const [editingDate, setEditingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState<string>("");

  // Escape key closes panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!lead) return null;

  const l = lead;
  const col = STATUSES.find(s => s.value === l.status) ?? STATUSES[0];
  const initials = (l.name as string).split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  const saveDate = (val: string) => {
    updateMutation.mutate({ id: l.id, data: { follow_up_date: val || null } });
    setEditingDate(false);
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed left-0 top-0 h-full z-50 flex flex-col bg-white shadow-2xl border-r border-slate-200"
        style={{ width: "clamp(320px, 28vw, 420px)", overflowY: "auto" }}
      >
        {/* ── Header ── */}
        <div style={{ background: "linear-gradient(135deg, #266b75 0%, #1d5259 100%)" }}
          className="p-5 pb-6 shrink-0"
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center text-white font-bold text-lg shrink-0">
              {initials}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
          <h2 className="text-xl font-bold text-white leading-snug">{l.name}</h2>
          {l.business_name && (
            <p className="text-white/75 text-sm mt-0.5 font-medium">{l.business_name}</p>
          )}
          {l.title && (
            <p className="text-white/60 text-xs mt-0.5">{l.title}{l.management_level ? ` · ${l.management_level}` : ""}</p>
          )}
          {/* Status pill */}
          <div className="mt-3 flex items-center gap-2">
            <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full border", col.pill)}>
              {col.label}
            </span>
            {l.lead_source && (
              <span className="text-xs text-white/50">via {l.lead_source}</span>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 flex flex-col gap-5 p-5">

          {/* Status timeline */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Pipeline Stage</p>
            <StatusTimeline
              currentStatus={l.status}
              onSetStatus={(s) => onSetStatus(l.id, s)}
              isPending={isPending}
            />
            <div className="flex justify-between mt-1">
              {STATUSES.map(s => (
                <span key={s.value}
                  className={cn("text-[9px] font-medium flex-1 text-center",
                    s.value === l.status ? "text-slate-700 font-bold" : "text-slate-300")}
                >{s.label}</span>
              ))}
            </div>
          </div>

          {/* Est. Value */}
          <div className={cn("rounded-xl px-4 py-3 border", l.estimated_value > 0 ? "bg-emerald-50 border-emerald-100" : "bg-slate-50 border-slate-100")}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <DollarSign className="w-3 h-3 text-slate-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Estimated Value</span>
            </div>
            {l.estimated_value > 0
              ? <p className="text-xl font-bold text-emerald-700">{formatCurrency(l.estimated_value)}</p>
              : <p className="text-sm text-slate-400">Not set</p>
            }
          </div>

          {/* Contact */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Contact</p>
            <div className="flex flex-col gap-2">
              {l.email && (
                <a href={`mailto:${l.email}`}
                  className="flex items-center gap-2 text-sm text-slate-700 hover:text-[#266b75] transition-colors group"
                >
                  <span className="p-1.5 rounded-lg bg-slate-100 group-hover:bg-[#266b75]/10 transition-colors shrink-0">
                    <Mail className="w-3 h-3 text-slate-500" />
                  </span>
                  <span className="truncate">{l.email}</span>
                </a>
              )}
              {l.phone && (
                <a href={`tel:${l.phone}`}
                  className="flex items-center gap-2 text-sm text-slate-700 hover:text-[#266b75] transition-colors group"
                >
                  <span className="p-1.5 rounded-lg bg-slate-100 group-hover:bg-[#266b75]/10 transition-colors shrink-0">
                    <Phone className="w-3 h-3 text-slate-500" />
                  </span>
                  <span>{l.phone}</span>
                </a>
              )}
              {l.cell_phone && l.cell_phone !== l.phone && (
                <a href={`tel:${l.cell_phone}`}
                  className="flex items-center gap-2 text-sm text-slate-700 hover:text-[#266b75] transition-colors group"
                >
                  <span className="p-1.5 rounded-lg bg-slate-100 group-hover:bg-[#266b75]/10 transition-colors shrink-0">
                    <Phone className="w-3 h-3 text-slate-400" />
                  </span>
                  <span>{l.cell_phone} <span className="text-xs text-slate-400">(cell)</span></span>
                </a>
              )}
              {/* Follow-up date */}
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-slate-100 shrink-0">
                  <Calendar className="w-3 h-3 text-slate-500" />
                </span>
                {editingDate ? (
                  <input
                    type="date"
                    autoFocus
                    defaultValue={l.follow_up_date?.split("T")[0] ?? ""}
                    onBlur={e => saveDate(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveDate((e.target as HTMLInputElement).value); if (e.key === "Escape") setEditingDate(false); }}
                    className="flex-1 text-sm border border-[#266b75]/40 rounded-lg px-2 py-1 focus:outline-none focus:border-[#266b75]"
                  />
                ) : (
                  <button
                    onClick={() => { setDateDraft(l.follow_up_date?.split("T")[0] ?? ""); setEditingDate(true); }}
                    className={cn("text-sm text-left hover:text-[#266b75] transition-colors",
                      l.follow_up_date ? "text-slate-700" : "text-slate-400")}
                  >
                    {l.follow_up_date
                      ? <>Follow up: <span className="font-medium">{new Date(l.follow_up_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></>
                      : "Set follow-up date…"
                    }
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Company / Location */}
          {(l.industry || l.city || l.state || l.company_size || l.revenue || l.founded_year) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Company</p>
              <div className="bg-slate-50 rounded-xl border border-slate-100 divide-y divide-slate-100">
                {l.industry && (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-600">{l.industry}</span>
                  </div>
                )}
                {(l.city || l.state) && (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-600">{[l.city, l.state].filter(Boolean).join(", ")}</span>
                  </div>
                )}
                {l.company_size && (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Users className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-600">{l.company_size} employees</span>
                  </div>
                )}
                {l.revenue && (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <DollarSign className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-600">Revenue: {l.revenue}</span>
                  </div>
                )}
                {l.founded_year && (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-600">Founded {l.founded_year}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Social / Web links */}
          {(l.linkedin_url || l.website || l.facebook_url || l.x_url) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Links</p>
              <div className="flex flex-wrap gap-2">
                {l.linkedin_url && (
                  <a href={l.linkedin_url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" /> LinkedIn
                  </a>
                )}
                {l.website && (
                  <a href={l.website} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <Globe className="w-3 h-3" /> Website
                  </a>
                )}
                {l.facebook_url && (
                  <a href={l.facebook_url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" /> Facebook
                  </a>
                )}
                {l.x_url && (
                  <a href={l.x_url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white hover:bg-slate-700 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" /> 𝕏
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Notes</p>
            <LeadNotes leadId={l.id} notes={l.notes} />
          </div>

          {/* Linked Client */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Linked Client</p>
            <LeadClientLink leadId={l.id} clientId={l.client_id} clients={clients} />
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Leads() {
  const { data: leads, isLoading } = useListLeads();
  const { data: clients = [] } = useListClients();
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const selectedLead = (leads ?? []).find(l => l.id === selectedLeadId) ?? null;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [importRows, setImportRows] = useState<CsvLead[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateLead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        setIsModalOpen(false);
        reset();
        toast({ title: "Lead added" });
      },
    },
  });

  const updateMutation = useUpdateLead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        toast({ title: "Status updated" });
      },
    },
  });

  const deleteMutation = useDeleteLead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        setDeletingId(null);
        toast({ title: "Lead removed" });
      },
      onError: () => {
        setDeletingId(null);
        toast({ title: "Failed to remove lead", variant: "destructive" });
      },
    },
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { status: "new" },
  });

  const onSubmit = (data: FormValues) => createMutation.mutate({
    data: {
      ...data,
      email: data.email || null,
      follow_up_date: data.follow_up_date || null,
      lead_source: data.lead_source || null,
      notes: data.notes || null,
    },
  });

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      setImportError("Please select a .csv file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setImportError("No valid leads found. Check that your CSV has the expected column headings.");
        setShowImportModal(true);
      } else {
        setImportRows(rows);
        setShowImportModal(true);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImport = async () => {
    setImportProgress({ done: 0, total: importRows.length });
    let done = 0;
    for (const lead of importRows) {
      try {
        await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ...lead, status: "new" }),
        });
      } catch { /* continue */ }
      done++;
      setImportProgress({ done, total: importRows.length });
    }
    await queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
    setImportProgress(null);
    setShowImportModal(false);
    setImportRows([]);
    toast({ title: `${done} lead${done !== 1 ? "s" : ""} imported successfully` });
  };

  const setStatus = (id: number, status: LeadStatus) =>
    updateMutation.mutate({ id, data: { status } });

  const handleDelete = (id: number) => {
    setDeletingId(id);
    deleteMutation.mutate({ id });
  };

  const allLeads = leads ?? [];
  const totalLeads = allLeads.length;
  const totalValue = allLeads.reduce((a, l) => a + (l.estimated_value || 0), 0);
  const openPipelineValue = allLeads
    .filter(l => l.status !== "closed")
    .reduce((a, l) => a + (l.estimated_value || 0), 0);
  const closedValue = allLeads
    .filter(l => l.status === "closed")
    .reduce((a, l) => a + (l.estimated_value || 0), 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">CRM Leads</h1>
          <p className="text-slate-500 mt-1">Track and advance your prospect pipeline.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => csvInputRef.current?.click()}
            className="flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium px-4 py-2 rounded-xl text-sm transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <button onClick={() => setIsModalOpen(true)} className="btn-primary">
            <Plus className="w-5 h-5 mr-2" />
            Add New Lead
          </button>
        </div>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleCsvFile}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Leads</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{totalLeads}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Open Pipeline</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{formatCurrency(openPipelineValue)}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <CheckCircle className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Closed Value</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{formatCurrency(closedValue)}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-3">
          <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl shrink-0">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Est. Value</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{formatCurrency(totalValue)}</p>
          </div>
        </div>
      </div>

      {/* Leads by Status Breakdown */}
      {totalLeads > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Leads by Stage</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STATUSES.map(s => {
              const count = allLeads.filter(l => l.status === s.value).length;
              const val = allLeads
                .filter(l => l.status === s.value)
                .reduce((a, l) => a + (l.estimated_value || 0), 0);
              return (
                <div key={s.value} className={cn("rounded-xl border px-4 py-3", s.pill)}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", s.dot)} />
                    <span className="text-xs font-semibold">{s.label}</span>
                  </div>
                  <p className="text-2xl font-bold">{count}</p>
                  {val > 0 && (
                    <p className="text-xs opacity-70 mt-0.5">{formatCurrency(val)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : totalLeads === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-16 text-center">
          <Target className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-slate-900">You're all caught up.</h3>
          <p className="text-slate-400 mt-2">Nothing needs your attention right now.</p>
          <button onClick={() => setIsModalOpen(true)} className="mt-6 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors" style={{ background: "#266b75" }}>
            Add New Lead
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {STATUSES.map(col => {
            const colLeads = allLeads.filter(l => l.status === col.value);
            const colValue = colLeads.reduce((a, l) => a + (l.estimated_value || 0), 0);

            return (
              <div key={col.value} className="flex flex-col gap-3">
                {/* Column Header */}
                <div
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 bg-white rounded-xl border shadow-sm",
                    col.col
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2.5 h-2.5 rounded-full", col.dot)} />
                    <span className="font-semibold text-slate-800 text-sm">{col.label}</span>
                    <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                      {colLeads.length}
                    </span>
                  </div>
                  {colValue > 0 && (
                    <span className="text-xs font-semibold text-slate-500">{formatCurrency(colValue)}</span>
                  )}
                </div>

                {/* Cards */}
                {colLeads.length === 0 ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-xl py-8 text-center text-slate-400 text-sm">
                    You're all caught up.
                  </div>
                ) : (
                  colLeads.map(lead => (
                    <div
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3 hover:border-[#266b75]/40 hover:shadow-md transition-all cursor-pointer"
                    >
                      {/* Lead name + email + delete */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-900 text-sm leading-snug truncate">
                            {lead.name}
                          </h3>
                          {(lead as any).business_name && (
                            <p className="text-xs text-slate-600 font-medium mt-0.5 truncate">
                              {(lead as any).business_name}
                            </p>
                          )}
                          {lead.email && (
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                              <Mail className="w-3 h-3 shrink-0" />
                              {lead.email}
                            </p>
                          )}
                          {(lead as any).phone && (
                            <p className="text-xs text-slate-400 mt-0.5">{(lead as any).phone}</p>
                          )}
                          {lead.lead_source && (
                            <p className="text-xs text-slate-400 mt-0.5">via {lead.lead_source}</p>
                          )}
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(lead.id); }}
                          disabled={deletingId === lead.id}
                          className="shrink-0 p-1 text-slate-300 hover:text-red-500 transition-colors rounded"
                          title="Delete lead"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Estimated Value */}
                      {lead.estimated_value != null && lead.estimated_value > 0 ? (
                        <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5 flex items-baseline gap-1">
                          <span className="text-xs font-medium text-emerald-600 uppercase tracking-wider">
                            Est. Value
                          </span>
                          <span className="ml-auto text-base font-bold text-emerald-700">
                            {formatCurrency(lead.estimated_value)}
                          </span>
                        </div>
                      ) : (
                        <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5">
                          <span className="text-xs text-slate-400">No estimated value</span>
                        </div>
                      )}

                      {/* Status Timeline */}
                      <div onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pipeline</span>
                          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", col.pill)}>
                            {col.label}
                          </span>
                        </div>
                        <StatusTimeline
                          currentStatus={lead.status}
                          onSetStatus={(s) => setStatus(lead.id, s)}
                          isPending={updateMutation.isPending}
                        />
                        <div className="flex justify-between mt-1">
                          {STATUSES.map(s => (
                            <button
                              key={s.value}
                              onClick={() => lead.status !== s.value && setStatus(lead.id, s.value)}
                              disabled={updateMutation.isPending}
                              className={cn(
                                "text-[9px] font-medium transition-colors flex-1 text-center",
                                s.value === lead.status ? "text-slate-700 font-bold" : "text-slate-300 hover:text-slate-500"
                              )}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Follow-up date */}
                      {lead.follow_up_date && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Calendar className="w-3 h-3 shrink-0 text-blue-400" />
                          <span>
                            Follow up:{" "}
                            <span className="font-medium text-slate-700">
                              {new Date(lead.follow_up_date + "T00:00:00").toLocaleDateString("en-US", {
                                month: "short", day: "numeric", year: "numeric",
                              })}
                            </span>
                          </span>
                        </div>
                      )}

                      {/* Notes */}
                      <div onClick={e => e.stopPropagation()}>
                        <LeadNotes leadId={lead.id} notes={lead.notes} />
                      </div>

                      {/* Linked Client */}
                      <div onClick={e => e.stopPropagation()}>
                        <LeadClientLink
                          leadId={lead.id}
                          clientId={(lead as any).client_id}
                          clients={clients}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Lead Detail Panel */}
      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          clients={clients}
          onClose={() => setSelectedLeadId(null)}
          onSetStatus={setStatus}
          isPending={updateMutation.isPending}
        />
      )}

      {/* Add Lead Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New Lead">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label-text">Contact / Company Name</label>
            <input {...register("name")} className="input-field" placeholder="Jane Doe" />
            {errors.name && (
              <p className="text-destructive text-xs mt-1">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="label-text">Email Address (Optional)</label>
            <input
              type="email"
              {...register("email")}
              className="input-field"
              placeholder="jane@example.com"
            />
            {errors.email && (
              <p className="text-destructive text-xs mt-1">{errors.email.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Estimated Value ($)</label>
              <input
                type="number"
                {...register("estimated_value")}
                className="input-field"
                placeholder="1000"
              />
            </div>
            <div>
              <label className="label-text">Lead Source</label>
              <input
                {...register("lead_source")}
                className="input-field"
                placeholder="Referral, Website…"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Status</label>
              <select {...register("status")} className="input-field">
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="proposal">Proposal</option>
                <option value="closed">Closed (Won)</option>
              </select>
            </div>
            <div>
              <label className="label-text">Follow-up Date (Optional)</label>
              <input
                type="date"
                {...register("follow_up_date")}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="label-text">Notes (Optional)</label>
            <textarea
              {...register("notes")}
              className="input-field min-h-[80px] resize-none"
              placeholder="Initial notes about this lead…"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || createMutation.isPending}
              className="btn-primary"
            >
              {createMutation.isPending ? "Adding…" : "Add Lead"}
            </button>
          </div>
        </form>
      </Modal>

      {/* CSV Import Preview Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 p-6 border-b border-slate-100">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Import Leads from CSV</h2>
                {importRows.length > 0 && (
                  <p className="text-sm text-slate-500 mt-0.5">
                    {importRows.length} lead{importRows.length !== 1 ? "s" : ""} found — all will be added as <span className="font-medium text-blue-600">New Lead</span>
                  </p>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {importError ? (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">Could not read CSV</p>
                    <p className="text-sm text-red-600 mt-0.5">{importError}</p>
                    <p className="text-xs text-red-500 mt-2">Expected headings: First Name, Last Name, Company, Title, Email, Biz Phone, Cell Phone, City, State, LinkedIn Profile, Website, Facebook Profile, X Profile, Description, Management Level, Industry, Company Size, Revenue, Founded Year</p>
                  </div>
                </div>
              ) : importProgress ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 text-center">
                    Importing {importProgress.done} of {importProgress.total} leads…
                  </p>
                  <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div
                      className="bg-blue-500 h-2.5 rounded-full transition-all"
                      style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 text-center">{Math.round((importProgress.done / importProgress.total) * 100)}% complete</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Preview (first 5 rows)</p>
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                    {importRows.slice(0, 5).map((lead, i) => (
                      <div key={i} className="flex items-start gap-3 px-4 py-3 bg-white hover:bg-slate-50 transition-colors">
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                          {lead.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">{lead.name}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                            {lead.business_name && <span className="text-xs text-slate-500">{lead.business_name}{lead.title ? ` · ${lead.title}` : ""}</span>}
                            {lead.email && <span className="text-xs text-slate-400">{lead.email}</span>}
                            {(lead.city || lead.state) && <span className="text-xs text-slate-400">{[lead.city, lead.state].filter(Boolean).join(", ")}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                    {importRows.length > 5 && (
                      <div className="px-4 py-2.5 bg-slate-50 text-center text-xs text-slate-400">
                        + {importRows.length - 5} more lead{importRows.length - 5 !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {!importProgress && (
              <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={() => { setShowImportModal(false); setImportRows([]); setImportError(null); }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                {importRows.length > 0 && (
                  <button onClick={handleImport} className="btn-primary">
                    <Upload className="w-4 h-4 mr-1.5" />
                    Import {importRows.length} Lead{importRows.length !== 1 ? "s" : ""}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useRef } from "react";
import {
  useListLeads,
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
import { Plus, Target, Mail, TrendingUp, Users, CheckCircle, Trash2, ChevronRight, StickyNote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  estimated_value: z.coerce.number().optional().nullable(),
  status: z.nativeEnum(LeadStatus).default("new"),
  lead_source: z.string().optional(),
  notes: z.string().optional(),
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

export default function Leads() {
  const { data: leads, isLoading } = useListLeads();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
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

  const onSubmit = (data: FormValues) => createMutation.mutate({ data });

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
        <button onClick={() => setIsModalOpen(true)} className="btn-primary">
          <Plus className="w-5 h-5 mr-2" />
          Add Lead
        </button>
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
          <h3 className="text-xl font-medium text-slate-900">No leads yet</h3>
          <p className="text-slate-500 mt-2">Add prospects to start building your pipeline.</p>
          <button onClick={() => setIsModalOpen(true)} className="btn-secondary mt-6">
            Add your first lead
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
                    No leads here
                  </div>
                ) : (
                  colLeads.map(lead => (
                    <div
                      key={lead.id}
                      className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3 hover:border-slate-300 transition-colors"
                    >
                      {/* Lead name + email + delete */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-900 text-sm leading-snug truncate">
                            {lead.name}
                          </h3>
                          {lead.email && (
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                              <Mail className="w-3 h-3 shrink-0" />
                              {lead.email}
                            </p>
                          )}
                          {lead.lead_source && (
                            <p className="text-xs text-slate-400 mt-0.5">via {lead.lead_source}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDelete(lead.id)}
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
                      <div>
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

                      {/* Notes */}
                      <LeadNotes leadId={lead.id} notes={lead.notes} />
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
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
    </div>
  );
}

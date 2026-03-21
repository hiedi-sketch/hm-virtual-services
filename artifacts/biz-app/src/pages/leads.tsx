import { useState } from "react";
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
import { Plus, Target, Mail, TrendingUp, Users, CheckCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  estimated_value: z.coerce.number().optional().nullable(),
  status: z.nativeEnum(LeadStatus).default("new"),
  lead_source: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const STATUSES: {
  value: LeadStatus;
  label: string;
  color: string;
  dot: string;
  col: string;
  pill: string;
}[] = [
  {
    value: "new",
    label: "New",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    col: "border-blue-200",
    pill: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    value: "contacted",
    label: "Contacted",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    col: "border-amber-200",
    pill: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    value: "proposal",
    label: "Proposal",
    color: "bg-violet-100 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
    col: "border-violet-200",
    pill: "bg-violet-50 text-violet-700 border-violet-200",
  },
  {
    value: "closed",
    label: "Closed",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    col: "border-emerald-200",
    pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
];

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

                      {/* Status Switcher */}
                      <div className="grid grid-cols-2 gap-1 text-xs font-semibold">
                        {STATUSES.map(s => (
                          <button
                            key={s.value}
                            onClick={() => lead.status !== s.value && setStatus(lead.id, s.value)}
                            disabled={updateMutation.isPending}
                            className={cn(
                              "py-1 px-2 rounded-md border transition-colors text-center",
                              lead.status === s.value
                                ? s.color + " cursor-default"
                                : "text-slate-400 border-slate-100 hover:bg-slate-50"
                            )}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
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

          <div className="grid grid-cols-2 gap-4">
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

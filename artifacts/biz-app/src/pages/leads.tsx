import { useState } from "react";
import { useListLeads, useCreateLead, useUpdateLead, getListLeadsQueryKey, LeadStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Target, Mail, DollarSign, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal('')),
  estimated_value: z.coerce.number().optional().nullable(),
  status: z.nativeEnum(LeadStatus).default('new'),
  lead_source: z.string().optional()
});

type FormValues = z.infer<typeof formSchema>;

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: "bg-blue-100 text-blue-700 border-blue-200",
  contacted: "bg-amber-100 text-amber-700 border-amber-200",
  closed: "bg-emerald-100 text-emerald-700 border-emerald-200"
};

export default function Leads() {
  const { data: leads, isLoading } = useListLeads();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateLead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        setIsModalOpen(false);
        reset();
        toast({ title: "Lead added successfully" });
      }
    }
  });

  const updateMutation = useUpdateLead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        toast({ title: "Status updated" });
      }
    }
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { status: 'new' }
  });

  const onSubmit = (data: FormValues) => {
    createMutation.mutate({ data });
  };

  const advanceStatus = (id: number, currentStatus: LeadStatus) => {
    const nextStatus = currentStatus === 'new' ? 'contacted' : 'closed';
    updateMutation.mutate({ id, data: { status: nextStatus } });
  };

  // Group leads for simple kanban-like view or summary
  const pipelineValue = leads?.filter(l => l.status !== 'closed').reduce((acc, l) => acc + (l.estimated_value || 0), 0) || 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">CRM Leads</h1>
          <p className="text-slate-500 mt-1">Track prospective clients. Pipeline Value: <strong className="text-slate-700">{formatCurrency(pipelineValue)}</strong></p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary">
          <Plus className="w-5 h-5 mr-2" />
          Add Lead
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          [1, 2, 3].map(i => <div key={i} className="h-48 bg-slate-100 rounded-2xl animate-pulse"></div>)
        ) : leads?.length === 0 ? (
           <div className="col-span-full bg-white rounded-2xl border border-dashed border-slate-300 p-16 text-center">
             <Target className="w-16 h-16 text-slate-300 mx-auto mb-4" />
             <h3 className="text-xl font-medium text-slate-900">No leads pipeline</h3>
             <p className="text-slate-500 mt-2">Start adding prospects to grow your business.</p>
             <button onClick={() => setIsModalOpen(true)} className="btn-secondary mt-6">Add your first lead</button>
           </div>
        ) : (
          leads?.map(lead => (
            <div key={lead.id} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm card-hover flex flex-col relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary/20"></div>
              
              <div className="flex justify-between items-start mb-4">
                <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border uppercase tracking-wider", STATUS_COLORS[lead.status])}>
                  {lead.status}
                </span>
                
                {lead.status !== 'closed' && (
                  <button 
                    onClick={() => advanceStatus(lead.id, lead.status)}
                    disabled={updateMutation.isPending}
                    className="text-xs font-medium text-slate-500 hover:text-primary flex items-center gap-1 bg-slate-50 hover:bg-primary/5 px-2 py-1 rounded border border-slate-200 hover:border-primary/30 transition-all"
                  >
                    Advance <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900">{lead.name}</h3>
                {lead.email && (
                  <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    {lead.email}
                  </p>
                )}
              </div>
              
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="text-sm">
                  <span className="text-slate-400 text-xs block mb-0.5">Est. Value</span>
                  <span className="font-semibold text-slate-700 flex items-center">
                    <DollarSign className="w-4 h-4 text-emerald-500 mr-0.5" />
                    {lead.estimated_value ? formatCurrency(lead.estimated_value).replace('$', '') : '--'}
                  </span>
                </div>
                {lead.lead_source && (
                  <div className="text-sm text-right">
                    <span className="text-slate-400 text-xs block mb-0.5">Source</span>
                    <span className="font-medium text-slate-700 truncate max-w-[100px] block">{lead.lead_source}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New Lead">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label-text">Contact / Company Name</label>
            <input {...register("name")} className="input-field" placeholder="John Smith" />
            {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="label-text">Email Address (Optional)</label>
            <input type="email" {...register("email")} className="input-field" placeholder="john@example.com" />
            {errors.email && <p className="text-destructive text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-text">Estimated Value ($)</label>
              <input type="number" {...register("estimated_value")} className="input-field" placeholder="1000" />
            </div>
            <div>
              <label className="label-text">Lead Source</label>
              <input {...register("lead_source")} className="input-field" placeholder="Referral, Website..." />
            </div>
          </div>
          
          <div>
            <label className="label-text">Initial Status</label>
            <select {...register("status")} className="input-field">
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="closed">Closed (Won)</option>
            </select>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmitting || createMutation.isPending} className="btn-primary">
              {isSubmitting || createMutation.isPending ? "Adding..." : "Add Lead"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

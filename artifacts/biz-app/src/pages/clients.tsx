import { useState } from "react";
import { useListClients, useCreateClient, getListClientsQueryKey, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Building2, Mail, DollarSign, ChevronRight, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  has_bookkeeping: z.boolean(),
  has_va: z.boolean(),
  monthly_hour_budget: z.coerce.number().min(0),
  monthly_fee: z.coerce.number().min(0),
  bk_fee: z.coerce.number().min(0).optional(),
  va_hourly_rate: z.coerce.number().min(0).optional(),
  va_hour_limit: z.coerce.number().min(0).optional(),
}).refine(d => d.has_bookkeeping || d.has_va, {
  message: "Select at least one service",
  path: ["has_bookkeeping"],
});

type FormValues = z.infer<typeof formSchema>;

function ServiceBadges({ serviceType, bkFee, vaRate }: {
  serviceType: string;
  bkFee?: number | null;
  vaRate?: number | null;
}) {
  const hasBK = serviceType === "bookkeeping" || serviceType === "hybrid";
  const hasVA = serviceType === "va" || serviceType === "hybrid";
  return (
    <div className="flex flex-wrap gap-1.5">
      {hasBK && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
          <DollarSign className="w-3 h-3" />
          BK{bkFee != null ? ` · ${formatCurrency(bkFee)}/mo` : ""}
        </span>
      )}
      {hasVA && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-primary/8 text-primary border border-primary/15"
          style={{ backgroundColor: "hsl(188 51% 30% / 0.08)", borderColor: "hsl(188 51% 30% / 0.15)" }}>
          <Clock className="w-3 h-3" />
          VA{vaRate != null ? ` · ${formatCurrency(vaRate)}/hr` : ""}
        </span>
      )}
    </div>
  );
}

export default function Clients() {
  const { data: clients, isLoading } = useListClients();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const createMutation = useCreateClient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setIsModalOpen(false);
        reset();
        toast({ title: "Client created successfully" });
      },
      onError: (error) => {
        toast({ title: "Failed to create client", description: error.message, variant: "destructive" });
      }
    }
  });

  const { register, handleSubmit, reset, watch, control, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      has_bookkeeping: false,
      has_va: true,
      monthly_hour_budget: 20,
      monthly_fee: 0,
      va_hourly_rate: 75,
      va_hour_limit: 20,
    }
  });

  const hasBookkeeping = watch("has_bookkeeping");
  const hasVA = watch("has_va");

  const onSubmit = (data: FormValues) => {
    const serviceType = data.has_bookkeeping && data.has_va
      ? "hybrid"
      : data.has_bookkeeping ? "bookkeeping" : "va";

    const bkFee = data.has_bookkeeping ? (data.bk_fee ?? 0) : undefined;
    const vaRate = data.has_va ? (data.va_hourly_rate ?? 0) : undefined;
    const vaLimit = data.has_va ? (data.va_hour_limit ?? 0) : undefined;

    const totalFee = data.monthly_fee > 0
      ? data.monthly_fee
      : (bkFee ?? 0) + (vaRate ?? 0) * (vaLimit ?? 0);
    const totalHours = data.monthly_hour_budget > 0
      ? data.monthly_hour_budget
      : (vaLimit ?? 0);

    createMutation.mutate({
      data: {
        name: data.name,
        email: data.email,
        service_type: serviceType as any,
        monthly_fee: totalFee,
        monthly_hour_budget: totalHours || 1,
        bk_fee: bkFee != null ? bkFee : null,
        va_hourly_rate: vaRate != null ? vaRate : null,
        va_hour_limit: vaLimit != null ? vaLimit : null,
      } as any
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 mt-1">Manage your clients and their retainer details.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary">
          <Plus className="w-5 h-5 mr-2" />
          Add Client
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                <th className="px-6 py-4">Client</th>
                <th className="px-6 py-4">Services</th>
                <th className="px-6 py-4">Hour Budget</th>
                <th className="px-6 py-4 text-right">Monthly Fee</th>
                <th className="px-4 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">Loading clients...</td>
                </tr>
              ) : clients?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Building2 className="w-12 h-12 text-slate-300 mb-3" />
                      <p className="text-slate-500 font-medium">No clients yet</p>
                      <button onClick={() => setIsModalOpen(true)} className="text-primary hover:underline mt-2 font-medium">
                        Add your first client
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                clients?.map(client => (
                  <tr
                    key={client.id}
                    onClick={() => navigate(`/clients/${client.id}`)}
                    className="hover:bg-primary/5 transition-colors cursor-pointer group"
                    style={{ "--tw-bg-opacity": "1" } as any}
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900 group-hover:text-primary transition-colors">{client.name}</div>
                      <div className="text-slate-400 text-xs flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3" /> {client.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <ServiceBadges
                        serviceType={client.service_type}
                        bkFee={client.bk_fee}
                        vaRate={client.va_hourly_rate}
                      />
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {client.monthly_hour_budget > 0
                        ? <span>{client.monthly_hour_budget} hrs/mo</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-900">
                      {formatCurrency(client.monthly_fee)}
                    </td>
                    <td className="px-4 py-4 text-slate-300 group-hover:text-primary transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New Client" description="Enter the details for your new client retainer.">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Name + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Company / Client Name</label>
              <input {...register("name")} className="input-field" placeholder="Acme Corp" />
              {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label-text">Contact Email</label>
              <input type="email" {...register("email")} className="input-field" placeholder="billing@acmecorp.com" />
              {errors.email && <p className="text-destructive text-xs mt-1">{errors.email.message}</p>}
            </div>
          </div>

          {/* Service toggles */}
          <div>
            <label className="label-text mb-2">Services</label>
            <div className="flex flex-col gap-2">
              <Controller
                name="has_bookkeeping"
                control={control}
                render={({ field }) => (
                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    field.value ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200 hover:border-slate-300"
                  }`}>
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={e => field.onChange(e.target.checked)}
                      className="mt-0.5 accent-emerald-600"
                    />
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Bookkeeping</div>
                      <div className="text-xs text-slate-500">Flat monthly fee for bookkeeping services</div>
                    </div>
                  </label>
                )}
              />
              <Controller
                name="has_va"
                control={control}
                render={({ field }) => (
                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    field.value ? "border-primary/30 bg-primary/5" : "bg-slate-50 border-slate-200 hover:border-slate-300"
                  }`}
                    style={field.value ? { backgroundColor: "hsl(188 51% 30% / 0.05)", borderColor: "hsl(188 51% 30% / 0.3)" } : {}}>
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={e => field.onChange(e.target.checked)}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Virtual Assistant</div>
                      <div className="text-xs text-slate-500">Hourly billing with optional monthly cap</div>
                    </div>
                  </label>
                )}
              />
            </div>
            {errors.has_bookkeeping && (
              <p className="text-destructive text-xs mt-1">{errors.has_bookkeeping.message}</p>
            )}
          </div>

          {/* Bookkeeping fields */}
          {hasBookkeeping && (
            <div className="bg-emerald-50 rounded-xl p-4 space-y-3 border border-emerald-100">
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" /> Bookkeeping Package
              </p>
              <div>
                <label className="label-text">Flat Monthly Fee ($)</label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="number" step="0.01" {...register("bk_fee")} className="input-field pl-9" placeholder="500" />
                </div>
              </div>
            </div>
          )}

          {/* VA fields */}
          {hasVA && (
            <div className="rounded-xl p-4 space-y-3 border" style={{ backgroundColor: "hsl(188 51% 30% / 0.04)", borderColor: "hsl(188 51% 30% / 0.15)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "#266b75" }}>
                <Clock className="w-3.5 h-3.5" /> VA Package
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Hourly Rate ($/hr)</label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="number" step="0.01" {...register("va_hourly_rate")} className="input-field pl-9" placeholder="75" />
                  </div>
                </div>
                <div>
                  <label className="label-text">Monthly Hour Limit</label>
                  <input type="number" {...register("va_hour_limit")} className="input-field" placeholder="20" />
                </div>
              </div>
            </div>
          )}

          {/* Total override */}
          <details className="group">
            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 select-none">
              Override total monthly fee / hour budget (optional)
            </summary>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className="label-text">Total Monthly Fee ($)</label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="number" step="0.01" {...register("monthly_fee")} className="input-field pl-9" placeholder="auto" />
                </div>
              </div>
              <div>
                <label className="label-text">Total Hour Budget</label>
                <input type="number" {...register("monthly_hour_budget")} className="input-field" placeholder="auto" />
              </div>
            </div>
          </details>

          <div className="pt-2 flex justify-end gap-3">
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmitting || createMutation.isPending} className="btn-primary">
              {isSubmitting || createMutation.isPending ? "Saving..." : "Create Client"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

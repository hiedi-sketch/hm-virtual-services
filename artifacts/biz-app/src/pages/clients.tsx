import { useState } from "react";
import { useListClients, useCreateClient, getListClientsQueryKey, getGetDashboardQueryKey, ClientServiceType } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Building2, Mail, Briefcase, DollarSign, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  monthly_hour_budget: z.coerce.number().min(1, "Must be at least 1 hour"),
  monthly_fee: z.coerce.number().min(0, "Fee cannot be negative"),
  service_type: z.nativeEnum(ClientServiceType)
});

type FormValues = z.infer<typeof formSchema>;

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

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { service_type: 'va', monthly_hour_budget: 10, monthly_fee: 500 }
  });

  const onSubmit = (data: FormValues) => {
    createMutation.mutate({ data });
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
                <th className="px-6 py-4">Client Info</th>
                <th className="px-6 py-4">Service Type</th>
                <th className="px-6 py-4">Monthly Budget</th>
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
                      <p className="text-slate-500 font-medium">No clients found</p>
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
                    className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">{client.name}</div>
                      <div className="text-slate-500 text-xs flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3" /> {client.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium capitalize bg-slate-100 text-slate-700 border border-slate-200">
                        {client.service_type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Briefcase className="w-4 h-4 text-slate-400" />
                        {client.monthly_hour_budget} hours
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-900">
                      {formatCurrency(client.monthly_fee)}
                    </td>
                    <td className="px-4 py-4 text-slate-300 group-hover:text-blue-400 transition-colors">
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-text">Service Type</label>
              <select {...register("service_type")} className="input-field">
                <option value="bookkeeping">Bookkeeping</option>
                <option value="va">Virtual Assistant</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label className="label-text">Monthly Fee ($)</label>
              <div className="relative">
                <DollarSign className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="number" {...register("monthly_fee")} className="input-field pl-10" placeholder="500" />
              </div>
              {errors.monthly_fee && <p className="text-destructive text-xs mt-1">{errors.monthly_fee.message}</p>}
            </div>
          </div>

          <div>
            <label className="label-text">Monthly Hour Budget</label>
            <input type="number" {...register("monthly_hour_budget")} className="input-field" placeholder="10" />
            {errors.monthly_hour_budget && <p className="text-destructive text-xs mt-1">{errors.monthly_hour_budget.message}</p>}
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting || createMutation.isPending} className="btn-primary">
              {isSubmitting || createMutation.isPending ? "Saving..." : "Create Client"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

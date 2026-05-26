import { useState } from "react";
import {
  useListClients,
  useCreateClient,
  getListClientsQueryKey,
  getGetDashboardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { ClientOnboardingModal } from "@/components/ClientOnboardingModal";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, Building2, Mail, ChevronRight, Clock, Phone, Globe, User,
  DollarSign, Monitor, TrendingUp, ChevronDown, ChevronUp, Send, ClipboardList,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const formSchema = z.object({
  name: z.string().min(1, "Business name is required"),
  contact_name: z.string().optional(),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  website: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function ClientRow({ client, onClick }: { client: any; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      className="hover:bg-primary/5 transition-colors cursor-pointer group"
    >
      <td className="px-6 py-4">
        <div className="font-semibold text-slate-900 group-hover:text-primary transition-colors flex items-center gap-2">
          {client.contact_name || client.name}
          {client.is_active === false && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 border border-slate-200">
              Inactive
            </span>
          )}
        </div>
        {client.contact_name && (
          <div className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
            <Building2 className="w-3 h-3" /> {client.name}
          </div>
        )}
        <div className="text-slate-400 text-xs flex items-center gap-1 mt-0.5">
          <Mail className="w-3 h-3" /> {client.email}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-wrap gap-1.5">
          {!client.service_type && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-400 border border-slate-200">
              No package yet
            </span>
          )}
          {(client.service_type === "bookkeeping" || client.service_type === "hybrid") && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
              <DollarSign className="w-3 h-3" />
              BK{client.bk_fee != null ? ` · ${formatCurrency(client.bk_fee)}/mo` : ""}
            </span>
          )}
          {(client.service_type === "va" || client.service_type === "hybrid") && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-[#266b75]/10 text-[#266b75] border border-[#266b75]/20">
              <Clock className="w-3 h-3" />
              VA{client.va_hourly_rate != null ? ` · ${formatCurrency(client.va_hourly_rate)}/hr` : ""}
            </span>
          )}
        </div>
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
  );
}

async function sendPortalInvite(clientId: number) {
  await fetch(`/api/clients/${clientId}/send-portal-invite`, {
    method: "POST",
    credentials: "include",
  });
}

export default function Clients() {
  const { data: clients, isLoading } = useListClients();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [sendInvite, setSendInvite] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const createMutation = useCreateClient({
    mutation: {
      onSuccess: async (newClient) => {
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setIsModalOpen(false);
        reset();
        if (sendInvite) {
          try {
            const res = await fetch(`/api/clients/${newClient.id}/send-portal-invite`, {
              method: "POST", credentials: "include",
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? "Failed to send invite");
            toast({ title: "Client created", description: "Portal invite email sent." });
          } catch (err: any) {
            toast({ title: "Client created", description: `Could not send invite: ${err.message}`, variant: "destructive" });
          }
        } else {
          toast({ title: "Client created successfully" });
        }
        setSendInvite(false);
      },
      onError: (error) => {
        toast({ title: "Failed to create client", description: error.message, variant: "destructive" });
      },
    },
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", contact_name: "", email: "", phone: "", website: "" },
  });

  const onSubmit = (data: FormValues) => {
    createMutation.mutate({
      data: {
        name: data.name,
        email: data.email,
        contact_name: data.contact_name?.trim() || null,
        phone: data.phone?.trim() || null,
        website: data.website?.trim() || null,
      } as any,
    });
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSendInvite(false);
    reset();
  };

  const allClients = clients ?? [];
  const activeClients = allClients.filter(c => (c as any).is_active !== false);
  const inactiveClients = allClients.filter(c => (c as any).is_active === false);

  const runningMonthlyTotal = activeClients.reduce((sum, c) => sum + (c.monthly_fee ?? 0), 0);
  const bkMonthlyTotal = activeClients
    .filter(c => c.service_type === "bookkeeping" || c.service_type === "hybrid")
    .reduce((sum, c) => sum + (c.bk_fee ?? 0), 0);
  const vaMonthlyTotal = runningMonthlyTotal - bkMonthlyTotal;

  const tableHeader = (
    <thead>
      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
        <th className="px-6 py-4">Client</th>
        <th className="px-6 py-4">Services</th>
        <th className="px-6 py-4">Hour Budget</th>
        <th className="px-6 py-4 text-right">Monthly Fee</th>
        <th className="px-4 py-4" />
      </tr>
    </thead>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 mt-1">Manage your clients and their service details.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowOnboarding(true)} className="btn-primary">
            <ClipboardList className="w-4 h-4 mr-1.5" />
            Onboard New Client
          </button>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            <Plus className="w-4 h-4" />
            Quick Add
          </button>
        </div>
      </div>

      {/* Running Monthly Total Card — active clients only */}
      {activeClients.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#266b75" }}>
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Running Monthly Total</p>
              <p className="text-3xl font-bold text-slate-900 leading-tight">{formatCurrency(runningMonthlyTotal)}</p>
              <p className="text-xs text-slate-400 mt-0.5">across {Math.max(0, activeClients.length - 1)} active client{(activeClients.length - 1) !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="flex gap-6 sm:gap-8 sm:border-l sm:border-slate-100 sm:pl-6">
            {bkMonthlyTotal > 0 && (
              <div className="flex flex-col items-start">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mb-0.5">
                  <DollarSign className="w-3 h-3" /> Bookkeeping
                </span>
                <span className="text-lg font-semibold text-slate-700">{formatCurrency(bkMonthlyTotal)}</span>
              </div>
            )}
            {vaMonthlyTotal > 0 && (
              <div className="flex flex-col items-start">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#266b75" }}>
                  <Monitor className="w-3 h-3" /> Virtual Assistant
                </span>
                <span className="text-lg font-semibold text-slate-700">{formatCurrency(vaMonthlyTotal)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active Clients Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            {tableHeader}
            <tbody className="divide-y divide-slate-100 text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">Loading clients...</td>
                </tr>
              ) : activeClients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Building2 className="w-12 h-12 text-slate-300 mb-3" />
                      <p className="text-slate-700 font-medium">No active clients.</p>
                      <p className="text-slate-400 text-sm mt-0.5">Add your first client to get started.</p>
                      <button onClick={() => setIsModalOpen(true)} className="mt-3 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors" style={{ background: "#266b75" }}>
                        Add New Client
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                activeClients.map(client => (
                  <ClientRow key={client.id} client={client} onClick={() => navigate(`/clients/${client.id}`)} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inactive Clients — collapsible section */}
      {inactiveClients.length > 0 && (
        <div className="rounded-2xl border border-slate-200 overflow-hidden">
          <button
            onClick={() => setShowInactive(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-500">Inactive Clients</span>
              <span className="text-xs font-semibold bg-slate-200 text-slate-500 rounded-full px-2 py-0.5">{inactiveClients.length}</span>
            </div>
            {showInactive ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {showInactive && (
            <div className="bg-white overflow-x-auto">
              <table className="w-full text-left border-collapse opacity-70">
                {tableHeader}
                <tbody className="divide-y divide-slate-100 text-sm">
                  {inactiveClients.map(client => (
                    <ClientRow key={client.id} client={client} onClick={() => navigate(`/clients/${client.id}`)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add New Client Modal */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title="Add New Client" description="Enter the client's contact details. Services can be assigned from the client detail page.">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact Information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label-text">Client Name</label>
                <input {...register("contact_name")} className="input-field" placeholder="Jane Smith" />
              </div>
              <div>
                <label className="label-text">Business Name <span className="text-destructive">*</span></label>
                <input {...register("name")} className="input-field" placeholder="Acme Corp" />
                {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label-text">Email Address <span className="text-destructive">*</span></label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="email" {...register("email")} className="input-field pl-9" placeholder="billing@acmecorp.com" />
                </div>
                {errors.email && <p className="text-destructive text-xs mt-1">{errors.email.message}</p>}
              </div>
              <div>
                <label className="label-text">Phone Number</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="tel" {...register("phone")} className="input-field pl-9" placeholder="(555) 123-4567" />
                </div>
              </div>
            </div>
            <div>
              <label className="label-text">Website</label>
              <div className="relative">
                <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="url" {...register("website")} className="input-field pl-9" placeholder="https://acmecorp.com" />
              </div>
            </div>
          </div>
          <label className="flex items-start gap-3 cursor-pointer select-none rounded-xl border border-[#266b75]/30 bg-[#266b75]/5 px-4 py-3 hover:bg-[#266b75]/10 transition-colors">
            <input
              type="checkbox"
              checked={sendInvite}
              onChange={e => setSendInvite(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-[#266b75] shrink-0"
            />
            <div>
              <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-[#266b75]" />
                Send portal invite email
              </p>
              <p className="text-xs text-slate-500 mt-0.5">An email will be sent inviting the client to set up their login and access their portal.</p>
            </div>
          </label>
          <div className="pt-2 flex justify-end gap-3">
            <button type="button" onClick={closeModal} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmitting || createMutation.isPending} className="btn-primary">
              {isSubmitting || createMutation.isPending ? "Saving..." : "Create Client"}
            </button>
          </div>
        </form>
      </Modal>

      <ClientOnboardingModal isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  );
}

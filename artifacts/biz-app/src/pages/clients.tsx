import { useState } from "react";
import {
  useListClients,
  useCreateClient,
  useListServices,
  assignClientService,
  getListClientsQueryKey,
  getGetDashboardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, Building2, Mail, ChevronRight, Clock, Phone, Globe, User,
  Package, X, DollarSign, Monitor, TrendingUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

// ── Form schema (contact info only) ──────────────────────────────────────────
const formSchema = z.object({
  name: z.string().min(1, "Business name is required"),
  contact_name: z.string().optional(),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  website: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// ── Pending service row ───────────────────────────────────────────────────────
type PendingService = {
  serviceId: number;
  name: string;
  serviceType: string;
  billingType: string;
  basePrice: number;
  baseHourlyRate: number | null;
  baseBudgetedHours: number | null;
  customPrice: string;
  customHourlyRate: string;
  customBudgetedHours: string;
};

function effectivePrice(ps: PendingService): number {
  if (ps.billingType === "Flat Rate") {
    return ps.customPrice !== "" ? Number(ps.customPrice) : ps.basePrice;
  }
  return 0;
}

function ServiceBadges({ pending }: { pending: PendingService[] }) {
  const bkServices = pending.filter(p => p.serviceType === "Bookkeeping");
  const vaServices = pending.filter(p => p.serviceType === "Virtual Assistant");

  return (
    <div className="flex flex-wrap gap-1.5">
      {bkServices.length > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
          <DollarSign className="w-3 h-3" />
          BK · {bkServices.length} service{bkServices.length !== 1 ? "s" : ""}
        </span>
      )}
      {vaServices.length > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-[#266b75]/10 text-[#266b75] border border-[#266b75]/20">
          <Monitor className="w-3 h-3" />
          VA · {vaServices.length} service{vaServices.length !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────
export default function Clients() {
  const { data: clients, isLoading } = useListClients();
  const { data: allServices = [] } = useListServices();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingServices, setPendingServices] = useState<PendingService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [noServicesError, setNoServicesError] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const createMutation = useCreateClient({
    mutation: {
      onSuccess: async (createdClient) => {
        // Assign all pending services to the new client
        const cid = createdClient.id;
        for (const ps of pendingServices) {
          try {
            await assignClientService(cid, {
              service_id: ps.serviceId,
              custom_price: ps.customPrice !== "" ? Number(ps.customPrice) : null,
              custom_hourly_rate: ps.customHourlyRate !== "" ? Number(ps.customHourlyRate) : null,
              custom_budgeted_hours: ps.customBudgetedHours !== "" ? Number(ps.customBudgetedHours) : null,
            });
          } catch {
            // Ignore — assignment errors are non-fatal
          }
        }
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setIsModalOpen(false);
        reset();
        setPendingServices([]);
        setSelectedServiceId("");
        setNoServicesError(false);
        toast({ title: "Client created successfully" });
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

  const handleAddService = () => {
    const id = Number(selectedServiceId);
    if (!id) return;
    if (pendingServices.some(p => p.serviceId === id)) return;
    const svc = allServices.find(s => s.id === id);
    if (!svc) return;

    setPendingServices(prev => [
      ...prev,
      {
        serviceId: svc.id,
        name: svc.name,
        serviceType: svc.service_type ?? "Virtual Assistant",
        billingType: svc.billing_type ?? "Flat Rate",
        basePrice: svc.price ?? 0,
        baseHourlyRate: svc.hourly_rate ?? null,
        baseBudgetedHours: svc.budgeted_hours ?? null,
        customPrice: svc.billing_type === "Flat Rate" ? String(svc.price ?? 0) : "",
        customHourlyRate: svc.billing_type === "Hourly" ? String(svc.hourly_rate ?? "") : "",
        customBudgetedHours: svc.service_type === "Virtual Assistant" ? String(svc.budgeted_hours ?? "") : "",
      },
    ]);
    setSelectedServiceId("");
    setNoServicesError(false);
  };

  const updatePending = (serviceId: number, field: keyof PendingService, value: string) => {
    setPendingServices(prev =>
      prev.map(p => p.serviceId === serviceId ? { ...p, [field]: value } : p),
    );
  };

  const removePending = (serviceId: number) => {
    setPendingServices(prev => prev.filter(p => p.serviceId !== serviceId));
  };

  const onSubmit = (data: FormValues) => {
    if (pendingServices.length === 0) {
      setNoServicesError(true);
      return;
    }

    const hasBK = pendingServices.some(p => p.serviceType === "Bookkeeping");
    const hasVA = pendingServices.some(p => p.serviceType === "Virtual Assistant");
    const serviceType = hasBK && hasVA ? "hybrid" : hasBK ? "bookkeeping" : "va";

    const monthlyFee = pendingServices
      .filter(p => p.billingType === "Flat Rate")
      .reduce((sum, p) => sum + effectivePrice(p), 0);

    const monthlyHourBudget = pendingServices
      .filter(p => p.serviceType === "Virtual Assistant")
      .reduce((sum, p) => {
        const h = p.customBudgetedHours !== "" ? Number(p.customBudgetedHours) : (p.baseBudgetedHours ?? 0);
        return sum + h;
      }, 0);

    const firstBK = pendingServices.find(p => p.serviceType === "Bookkeeping" && p.billingType === "Flat Rate");
    const firstVA = pendingServices.find(p => p.serviceType === "Virtual Assistant");

    createMutation.mutate({
      data: {
        name: data.name,
        email: data.email,
        contact_name: data.contact_name?.trim() || null,
        phone: data.phone?.trim() || null,
        website: data.website?.trim() || null,
        service_type: serviceType as any,
        monthly_fee: monthlyFee,
        monthly_hour_budget: monthlyHourBudget || 1,
        bk_fee: firstBK ? effectivePrice(firstBK) : null,
        va_hourly_rate: firstVA
          ? (firstVA.customHourlyRate !== "" ? Number(firstVA.customHourlyRate) : firstVA.baseHourlyRate)
          : null,
        va_hour_limit: firstVA
          ? (firstVA.customBudgetedHours !== "" ? Number(firstVA.customBudgetedHours) : firstVA.baseBudgetedHours)
          : null,
      } as any,
    });
  };

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
    setPendingServices([]);
    setSelectedServiceId("");
    setNoServicesError(false);
  };

  const availableToAdd = allServices.filter(s => s.active && !pendingServices.some(p => p.serviceId === s.id));

  // ── Running monthly totals ─────────────────────────────────────────────────
  const allClients = clients ?? [];
  const runningMonthlyTotal = allClients.reduce((sum, c) => sum + (c.monthly_fee ?? 0), 0);
  const bkMonthlyTotal = allClients
    .filter(c => c.service_type === "bookkeeping" || c.service_type === "hybrid")
    .reduce((sum, c) => sum + (c.bk_fee ?? 0), 0);
  const vaMonthlyTotal = runningMonthlyTotal - bkMonthlyTotal;

  const flatTotal = pendingServices
    .filter(p => p.billingType === "Flat Rate")
    .reduce((sum, p) => sum + effectivePrice(p), 0);
  const hourlyServices = pendingServices.filter(p => p.billingType === "Hourly");

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 mt-1">Manage your clients and their service details.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary">
          <Plus className="w-5 h-5 mr-2" />
          Add New Client
        </button>
      </div>

      {/* ── Running Monthly Total Card ──────────────────────────────────────── */}
      {allClients.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#266b75" }}>
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Running Monthly Total</p>
              <p className="text-3xl font-bold text-slate-900 leading-tight">{formatCurrency(runningMonthlyTotal)}</p>
              <p className="text-xs text-slate-400 mt-0.5">across {allClients.length} client{allClients.length !== 1 ? "s" : ""}</p>
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
                      <p className="text-slate-700 font-medium">You're all caught up.</p>
                      <p className="text-slate-400 text-sm mt-0.5">No clients yet. Add your first to get started.</p>
                      <button onClick={() => setIsModalOpen(true)} className="mt-3 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors" style={{ background: "#266b75" }}>
                        Add New Client
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
                      {client.contact_name && (
                        <div className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
                          <User className="w-3 h-3" /> {client.contact_name}
                        </div>
                      )}
                      <div className="text-slate-400 text-xs flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3" /> {client.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5">
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add New Client Modal ────────────────────────────────────────── */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title="Add New Client" description="Enter the client's contact details and assign services from your library.">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* Contact Info */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact Information</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label-text">Business Name <span className="text-destructive">*</span></label>
                <input {...register("name")} className="input-field" placeholder="Acme Corp" />
                {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="label-text">Contact Name</label>
                <input {...register("contact_name")} className="input-field" placeholder="Jane Smith" />
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

          <div className="border-t border-slate-100" />

          {/* Services Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" /> Services
              </p>
            </div>

            {/* Service Selector */}
            <div className="flex gap-2">
              <select
                className="flex-1 border border-[#c8c7cb] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] transition-colors"
                value={selectedServiceId}
                onChange={e => setSelectedServiceId(e.target.value)}
              >
                <option value="">Select a service to add…</option>
                {availableToAdd.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.service_type} · {s.billing_type}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddService}
                disabled={!selectedServiceId}
                className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-colors"
                style={{ background: "#266b75" }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>

            {noServicesError && (
              <p className="text-destructive text-xs">Please add at least one service from the library.</p>
            )}

            {/* Pending Services List */}
            {pendingServices.length > 0 && (
              <div className="space-y-2">
                {pendingServices.map(ps => {
                  const isBK = ps.serviceType === "Bookkeeping";
                  const isVA = ps.serviceType === "Virtual Assistant";
                  const isHourly = ps.billingType === "Hourly";
                  const isFlatRate = ps.billingType === "Flat Rate";

                  return (
                    <div
                      key={ps.serviceId}
                      className="rounded-xl border border-[#c8c7cb] bg-slate-50/50 overflow-hidden"
                    >
                      {/* Header Row */}
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${isVA ? "bg-[#266b75]/10" : "bg-blue-50"}`}>
                          {isVA
                            ? <Monitor className="w-3 h-3 text-[#266b75]" />
                            : <DollarSign className="w-3 h-3 text-blue-600" />
                          }
                        </div>
                        <span className="text-sm font-medium text-slate-900 flex-1">{ps.name}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                          isVA ? "bg-[#266b75]/10 text-[#266b75] border-[#266b75]/20" : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>{ps.serviceType}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                          isHourly ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}>{ps.billingType}</span>
                        <button
                          type="button"
                          onClick={() => removePending(ps.serviceId)}
                          className="p-1 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors ml-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Override Fields */}
                      <div className="grid grid-cols-2 gap-3 px-3 pb-3 pt-1 border-t border-slate-100">
                        {isFlatRate && (
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Price ($/mo)</label>
                            <div className="relative">
                              <DollarSign className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="w-full border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#266b75]/30 focus:border-[#266b75]"
                                placeholder={String(ps.basePrice)}
                                value={ps.customPrice}
                                onChange={e => updatePending(ps.serviceId, "customPrice", e.target.value)}
                              />
                            </div>
                          </div>
                        )}
                        {isHourly && (
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Hourly Rate ($/hr)</label>
                            <div className="relative">
                              <DollarSign className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="w-full border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#266b75]/30 focus:border-[#266b75]"
                                placeholder={ps.baseHourlyRate != null ? String(ps.baseHourlyRate) : "0"}
                                value={ps.customHourlyRate}
                                onChange={e => updatePending(ps.serviceId, "customHourlyRate", e.target.value)}
                              />
                            </div>
                          </div>
                        )}
                        {isVA && (
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Budgeted Hours/mo</label>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#266b75]/30 focus:border-[#266b75]"
                              placeholder={ps.baseBudgetedHours != null ? String(ps.baseBudgetedHours) : "0"}
                              value={ps.customBudgetedHours}
                              onChange={e => updatePending(ps.serviceId, "customBudgetedHours", e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Monthly Value Summary */}
            {pendingServices.length > 0 && (
              <div className="rounded-xl border border-[#7dbdc6]/40 bg-[#266b75]/5 px-4 py-3 space-y-1.5">
                <p className="text-xs font-semibold text-[#266b75] uppercase tracking-wider">Monthly Value Summary</p>
                {flatTotal > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Total Fixed Monthly</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(flatTotal)}</span>
                  </div>
                )}
                {hourlyServices.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mt-1">Hourly Services <span className="text-amber-600">(Variable Billing)</span></p>
                    {hourlyServices.map(ps => {
                      const rate = ps.customHourlyRate !== "" ? Number(ps.customHourlyRate) : ps.baseHourlyRate;
                      return (
                        <div key={ps.serviceId} className="flex items-center justify-between text-xs text-slate-600 ml-2 mt-0.5">
                          <span>{ps.name}</span>
                          <span>{rate != null ? `${formatCurrency(rate)}/hr` : "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {flatTotal === 0 && hourlyServices.length === 0 && (
                  <p className="text-xs text-slate-400">No pricing configured yet</p>
                )}
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button type="button" onClick={closeModal} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmitting || createMutation.isPending} className="btn-primary">
              {isSubmitting || createMutation.isPending ? "Saving..." : "Create Client"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

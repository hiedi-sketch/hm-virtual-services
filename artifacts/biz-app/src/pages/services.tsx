import { useState } from "react";
import {
  useListServices,
  useCreateService,
  useUpdateService,
  useDeleteService,
  getListServicesQueryKey,
  Service,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  X,
  Pencil,
  Trash2,
  Package,
  Search,
  Clock,
  BookOpen,
  UserCheck,
  DollarSign,
  Timer,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] transition-colors";

type ServiceType = "Bookkeeping" | "Virtual Assistant";
type BillingType = "Flat Rate" | "Hourly";

interface ServiceFormState {
  name: string;
  description: string;
  service_type: ServiceType;
  price: string;
  billing_type: BillingType;
  hourly_rate: string;
  budgeted_hours: string;
  active: boolean;
}

const emptyForm = (): ServiceFormState => ({
  name: "",
  description: "",
  service_type: "Virtual Assistant",
  price: "",
  billing_type: "Flat Rate",
  hourly_rate: "",
  budgeted_hours: "",
  active: true,
});

function serviceTypeIcon(type: string, className = "w-4 h-4") {
  if (type === "Bookkeeping") return <BookOpen className={className} />;
  return <UserCheck className={className} />;
}

function serviceTypeBadge(type: string) {
  if (type === "Bookkeeping")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
        <BookOpen className="w-2.5 h-2.5" />
        Bookkeeping
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#266b75]/10 text-[#266b75] border border-[#266b75]/20">
      <UserCheck className="w-2.5 h-2.5" />
      Virtual Assistant
    </span>
  );
}

function billingTypeBadge(type: string) {
  if (type === "Hourly")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
        <Timer className="w-2.5 h-2.5" />
        Hourly
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
      <DollarSign className="w-2.5 h-2.5" />
      Flat Rate
    </span>
  );
}

export default function Services() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Service | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "Bookkeeping" | "Virtual Assistant">("all");
  const [filterBilling, setFilterBilling] = useState<"all" | "Flat Rate" | "Hourly">("all");

  const [form, setForm] = useState<ServiceFormState>(emptyForm());

  const { data: services = [], isLoading } = useListServices();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });

  const createMutation = useCreateService({
    mutation: {
      onSuccess: () => {
        invalidate();
        closeForm();
        toast({ title: "Service created" });
      },
      onError: () => toast({ title: "Failed to create service", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateService({
    mutation: {
      onSuccess: () => {
        invalidate();
        closeForm();
        toast({ title: "Service updated" });
      },
      onError: () => toast({ title: "Failed to update service", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteService({
    mutation: {
      onSuccess: () => {
        invalidate();
        setDeleteConfirm(null);
        toast({ title: "Service deleted" });
      },
      onError: () => toast({ title: "Failed to delete service", variant: "destructive" }),
    },
  });

  const openCreate = () => {
    setEditingService(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (svc: Service) => {
    setEditingService(svc);
    setForm({
      name: svc.name,
      description: svc.description ?? "",
      service_type: (svc.service_type ?? "Virtual Assistant") as ServiceType,
      price: svc.price != null ? String(svc.price) : "",
      billing_type: (svc.billing_type ?? "Flat Rate") as BillingType,
      hourly_rate: svc.hourly_rate != null ? String(svc.hourly_rate) : "",
      budgeted_hours: svc.budgeted_hours != null ? String(svc.budgeted_hours) : "",
      active: svc.active,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingService(null);
    setForm(emptyForm());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (form.billing_type === "Hourly" && !form.hourly_rate) return;

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      service_type: form.service_type,
      price: Number(form.price) || 0,
      billing_type: form.billing_type,
      hourly_rate: form.billing_type === "Hourly" && form.hourly_rate ? Number(form.hourly_rate) : null,
      budgeted_hours: form.service_type === "Virtual Assistant" && form.budgeted_hours ? Number(form.budgeted_hours) : null,
      active: form.active,
    };

    if (editingService) {
      updateMutation.mutate({ id: editingService.id, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  const filtered = services.filter(svc => {
    if (filterType !== "all" && svc.service_type !== filterType) return false;
    if (filterBilling !== "all" && svc.billing_type !== filterBilling) return false;
    if (search && !svc.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalActive = services.filter(s => s.active).length;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const isFormValid =
    form.name.trim() &&
    (form.billing_type !== "Hourly" || form.hourly_rate) &&
    (form.billing_type !== "Flat Rate" || form.price);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Services</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {totalActive} active service{totalActive !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 bg-[#266b75] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#266b75]/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add New Service
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search services…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75]"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["all", "Bookkeeping", "Virtual Assistant"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterType(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                filterType === f
                  ? "bg-[#266b75] text-white border-[#266b75]"
                  : "bg-white text-slate-600 border-slate-200 hover:border-[#266b75]/40 hover:text-[#266b75]"
              }`}
            >
              {f === "all" ? "All Types" : f}
            </button>
          ))}
          <div className="w-px bg-slate-200" />
          {(["all", "Flat Rate", "Hourly"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterBilling(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                filterBilling === f
                  ? "bg-slate-700 text-white border-slate-700"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
              }`}
            >
              {f === "all" ? "All Billing" : f}
            </button>
          ))}
        </div>
      </div>

      {/* Services List */}
      {isLoading ? (
        <div className="text-slate-400 text-sm py-12 text-center">Loading services…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <Package className="w-6 h-6 text-slate-300" />
          </div>
          <p className="text-slate-700 font-medium">No services found.</p>
          <p className="text-slate-400 text-sm mt-1">
            {services.length === 0 ? "Create your first service to get started." : "Try adjusting your search or filters."}
          </p>
          {services.length === 0 && (
            <button
              onClick={openCreate}
              className="mt-4 inline-flex items-center gap-2 bg-[#266b75] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#266b75]/90"
            >
              <Plus className="w-4 h-4" />
              Add New Service
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(svc => (
            <div
              key={svc.id}
              className={`bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-all ${!svc.active ? "opacity-60" : ""}`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    svc.service_type === "Bookkeeping" ? "bg-blue-50" : "bg-[#266b75]/10"
                  }`}>
                    {serviceTypeIcon(
                      svc.service_type ?? "Virtual Assistant",
                      `w-4 h-4 ${svc.service_type === "Bookkeeping" ? "text-blue-600" : "text-[#266b75]"}`
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm leading-tight truncate">{svc.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {serviceTypeBadge(svc.service_type ?? "Virtual Assistant")}
                      {billingTypeBadge(svc.billing_type ?? "Flat Rate")}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => openEdit(svc)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(svc)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Description */}
              {svc.description && (
                <p className="text-slate-500 text-xs leading-relaxed line-clamp-2">{svc.description}</p>
              )}

              {/* Pricing info */}
              <div className="mt-auto pt-3 border-t border-slate-50 space-y-1.5">
                {svc.billing_type === "Hourly" ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Hourly Rate
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {svc.hourly_rate != null ? `${formatCurrency(svc.hourly_rate)}/hr` : "—"}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      Flat Rate
                    </span>
                    <span className="text-sm font-bold text-slate-900">{formatCurrency(svc.price)}</span>
                  </div>
                )}
                {svc.service_type === "Virtual Assistant" && svc.budgeted_hours != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Timer className="w-3 h-3" />
                      Budgeted Hours
                    </span>
                    <span className="text-sm font-semibold text-[#266b75]">{svc.budgeted_hours} hrs/mo</span>
                  </div>
                )}
                {!svc.active && (
                  <div className="flex justify-end">
                    <span className="text-[10px] font-medium bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200">
                      Inactive
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">
                {editingService ? "Edit Service" : "Add New Service"}
              </h2>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Service Type */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Service Type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["Bookkeeping", "Virtual Assistant"] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setForm(f => ({
                        ...f,
                        service_type: type,
                        budgeted_hours: type === "Bookkeeping" ? "" : f.budgeted_hours,
                      }))}
                      className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                        form.service_type === type
                          ? type === "Bookkeeping"
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-[#266b75] bg-[#266b75]/5 text-[#266b75]"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      {type === "Bookkeeping"
                        ? <BookOpen className="w-4 h-4 shrink-0" />
                        : <UserCheck className="w-4 h-4 shrink-0" />
                      }
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Service Name */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Service Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Monthly Bookkeeping Package"
                  className={inputCls}
                  required
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of the service…"
                  rows={2}
                  className={`${inputCls} resize-none`}
                />
              </div>

              {/* Billing Type Toggle */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Billing Type</label>
                <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                  {(["Flat Rate", "Hourly"] as const).map(bt => (
                    <button
                      key={bt}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, billing_type: bt }))}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                        form.billing_type === bt
                          ? "bg-white shadow-sm text-slate-800"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {bt === "Hourly" ? <Clock className="w-3.5 h-3.5" /> : <DollarSign className="w-3.5 h-3.5" />}
                      {bt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price (Flat Rate) / Hourly Rate */}
              <div className="grid grid-cols-2 gap-3">
                {form.billing_type === "Flat Rate" ? (
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Flat Rate Price <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.price}
                        onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                        placeholder="0.00"
                        className={`${inputCls} pl-7`}
                        required={form.billing_type === "Flat Rate"}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">
                        Hourly Rate <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.hourly_rate}
                          onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))}
                          placeholder="0.00"
                          className={`${inputCls} pl-7`}
                          required={form.billing_type === "Hourly"}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Base Price (optional)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.price}
                          onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                          placeholder="0.00"
                          className={`${inputCls} pl-7`}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Budgeted Hours — VA only */}
              {form.service_type === "Virtual Assistant" && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Budgeted Hours / Month
                    <span className="ml-1.5 text-[10px] font-normal text-[#266b75] bg-[#266b75]/10 px-1.5 py-0.5 rounded-full">VA only</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.budgeted_hours}
                    onChange={e => setForm(f => ({ ...f, budgeted_hours: e.target.value }))}
                    placeholder="e.g. 20"
                    className={inputCls}
                  />
                </div>
              )}

              {/* Active */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="active"
                  checked={form.active}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 accent-[#266b75]"
                />
                <label htmlFor="active" className="text-sm text-slate-700 cursor-pointer">
                  Active (visible for assignment)
                </label>
              </div>

              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !isFormValid}
                  className="flex-1 px-4 py-2 rounded-lg bg-[#266b75] text-white text-sm font-medium hover:bg-[#266b75]/90 disabled:opacity-50 transition-colors"
                >
                  {isPending ? "Saving…" : editingService ? "Save Changes" : "Create Service"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Delete Service</p>
                <p className="text-sm text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-700 mb-5">
              Are you sure you want to delete <span className="font-medium">"{deleteConfirm.name}"</span>? It will also be removed from any client assignments.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate({ id: deleteConfirm.id })}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

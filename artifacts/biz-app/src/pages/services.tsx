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
  RefreshCw,
  ShoppingBag,
  Search,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary transition-colors";

type BillingType = "one_time" | "recurring";

interface ServiceFormState {
  name: string;
  description: string;
  price: string;
  billing_type: BillingType;
  active: boolean;
}

const emptyForm = (): ServiceFormState => ({
  name: "",
  description: "",
  price: "",
  billing_type: "one_time",
  active: true,
});

export default function Services() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Service | null>(null);
  const [search, setSearch] = useState("");
  const [filterBilling, setFilterBilling] = useState<"all" | "one_time" | "recurring">("all");

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
      price: String(svc.price),
      billing_type: svc.billing_type as BillingType,
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
    if (!form.name.trim() || !form.price) return;

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: Number(form.price),
      billing_type: form.billing_type,
      active: form.active,
    };

    if (editingService) {
      updateMutation.mutate({ id: editingService.id, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  const filtered = services.filter(svc => {
    if (filterBilling !== "all" && svc.billing_type !== filterBilling) return false;
    if (search && !svc.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalActive = services.filter(s => s.active).length;

  const billingLabel = (bt: string) =>
    bt === "recurring" ? "Recurring" : "One-time";

  const isPending = createMutation.isPending || updateMutation.isPending;

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
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Service
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
            className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "one_time", "recurring"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterBilling(f)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterBilling === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f === "all" ? "All" : f === "one_time" ? "One-time" : "Recurring"}
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
          <p className="text-slate-500 font-medium">
            {services.length === 0 ? "No services yet" : "No matching services"}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            {services.length === 0 ? "Add your first service to get started." : "Try adjusting your search or filter."}
          </p>
          {services.length === 0 && (
            <button
              onClick={openCreate}
              className="mt-4 inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
              Add Service
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(svc => (
            <div
              key={svc.id}
              className={`bg-white border rounded-xl p-5 flex flex-col gap-3 shadow-sm transition-opacity ${!svc.active ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    {svc.billing_type === "recurring" ? (
                      <RefreshCw className="w-4 h-4 text-primary" />
                    ) : (
                      <ShoppingBag className="w-4 h-4 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm leading-tight truncate">{svc.name}</p>
                    <span
                      className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 ${
                        svc.billing_type === "recurring"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-slate-50 text-slate-600"
                      }`}
                    >
                      {billingLabel(svc.billing_type)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
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

              {svc.description && (
                <p className="text-slate-500 text-xs leading-relaxed line-clamp-2">{svc.description}</p>
              )}

              <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-50">
                <span className="text-lg font-bold text-slate-900">{formatCurrency(svc.price)}</span>
                {!svc.active && (
                  <span className="text-[10px] font-medium bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full">
                    Inactive
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">
                {editingService ? "Edit Service" : "New Service"}
              </h2>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Service Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Monthly Bookkeeping"
                  className={inputCls}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of the service…"
                  rows={3}
                  className={`${inputCls} resize-none`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Price <span className="text-red-500">*</span>
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
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Billing Type
                  </label>
                  <select
                    value={form.billing_type}
                    onChange={e => setForm(f => ({ ...f, billing_type: e.target.value as BillingType }))}
                    className={inputCls}
                  >
                    <option value="one_time">One-time</option>
                    <option value="recurring">Recurring</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="active"
                  checked={form.active}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-primary accent-primary"
                />
                <label htmlFor="active" className="text-sm text-slate-700 cursor-pointer">
                  Active (visible for assignment)
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !form.name.trim() || !form.price}
                  className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
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

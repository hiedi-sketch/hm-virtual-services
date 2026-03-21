import { useGetDashboard, useCreateTask, useListClients, getListTasksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatCurrency } from "@/lib/utils";
import { Users, DollarSign, Clock, AlertCircle, Plus, CheckSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const quickTaskSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  client_id: z.coerce.number().min(1, "Please select a client"),
});
type QuickTaskValues = z.infer<typeof quickTaskSchema>;

export default function Dashboard() {
  const { data: dashboard, isLoading } = useGetDashboard();
  const { data: clients } = useListClients();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<QuickTaskValues>({
    resolver: zodResolver(quickTaskSchema),
  });

  const createTask = useCreateTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        reset();
        toast({ title: "Task added" });
      },
      onError: () => {
        toast({ title: "Failed to add task", variant: "destructive" });
      },
    },
  });

  const onSubmit = (data: QuickTaskValues) => {
    createTask.mutate({ data });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-48 mb-8"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-white rounded-2xl border border-slate-100"></div>)}
        </div>
        <div className="h-64 bg-white rounded-2xl border border-slate-100 mt-8"></div>
      </div>
    );
  }

  const dashClients = dashboard || [];
  const totalClients = dashClients.length;
  const totalRevenue = dashClients.reduce((acc, c) => acc + c.monthly_fee, 0);
  const totalHoursBudgeted = dashClients.reduce((acc, c) => acc + c.monthly_hour_budget, 0);
  const totalHoursUsed = dashClients.reduce((acc, c) => acc + c.hours_used_this_month, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Here's an overview of your business this month.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-200 transition-colors">
          <div className="absolute right-0 top-0 w-24 h-24 bg-blue-500/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Active Clients</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">{totalClients}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group hover:border-emerald-200 transition-colors">
          <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Monthly Recurring</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">{formatCurrency(totalRevenue)}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group hover:border-purple-200 transition-colors">
          <div className="absolute right-0 top-0 w-24 h-24 bg-purple-500/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Hours (Used / Budget)</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">{totalHoursUsed} <span className="text-slate-400 text-lg">/ {totalHoursBudgeted}</span></h3>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Add Task */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <CheckSquare className="w-5 h-5 text-blue-500" />
          <h2 className="font-semibold text-slate-900">Quick Add Task</h2>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              {...register("title")}
              placeholder="Task title…"
              className="input-field w-full"
            />
            {errors.title && <p className="text-destructive text-xs mt-1">{errors.title.message}</p>}
          </div>
          <div className="sm:w-52">
            <select {...register("client_id")} className="input-field w-full">
              <option value="">Assign to client…</option>
              {clients?.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.client_id && <p className="text-destructive text-xs mt-1">{errors.client_id.message}</p>}
          </div>
          <button
            type="submit"
            disabled={isSubmitting || createTask.isPending}
            className="btn-primary shrink-0"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {createTask.isPending ? "Adding…" : "Add Task"}
          </button>
        </form>
      </div>

      {/* Client Utilization */}
      <div>
        <h2 className="text-xl font-display font-semibold text-slate-900 mb-4">Client Utilization</h2>
        {dashClients.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-slate-900">No clients yet</h3>
            <p className="text-slate-500 mt-1">Add clients to see their hours utilization here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {dashClients.map(client => {
              const percentage = Math.min(100, Math.round((client.hours_used_this_month / client.monthly_hour_budget) * 100));
              const isOverBudget = percentage >= 100;
              const isNearBudget = percentage >= 85 && percentage < 100;

              const barColor = isOverBudget ? 'bg-red-500' : isNearBudget ? 'bg-amber-500' : 'bg-blue-500';
              const badgeColor = isOverBudget ? 'bg-red-100 text-red-700 border-red-200' :
                isNearBudget ? 'bg-amber-100 text-amber-700 border-amber-200' :
                  'bg-slate-100 text-slate-700 border-slate-200';

              return (
                <div key={client.id} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm card-hover">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-slate-900 text-lg">{client.name}</h3>
                      <p className="text-sm text-slate-500 capitalize">{client.service_type}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeColor}`}>
                      {percentage}% Used
                    </span>
                  </div>

                  <div className="mt-6">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-600 font-medium">{client.hours_used_this_month} hrs used</span>
                      <span className="text-slate-500">{client.hours_remaining} hrs remaining</span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${barColor}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>

                  {isOverBudget && (
                    <div className="mt-4 flex items-center gap-2 text-xs font-medium text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-100">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Client has exceeded monthly budget.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

import { useParams, useLocation } from "wouter";
import {
  useGetClient,
  useListTasks,
  useUpdateTask,
  useCreateTask,
  useGetDashboard,
  getListTasksQueryKey,
  TaskStatus,
  Task,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  Circle,
  Calendar,
  User as UserIcon,
  AlertCircle,
  Briefcase,
  Mail,
} from "lucide-react";
import { SubtaskList } from "@/components/SubtaskList";
import { formatCurrency } from "@/lib/utils";

function nextDueDate(recurrence: string): string {
  const d = new Date();
  if (recurrence === "daily") d.setDate(d.getDate() + 1);
  else if (recurrence === "weekly") d.setDate(d.getDate() + 7);
  else if (recurrence === "monthly") d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ClientDetail() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: client, isLoading: clientLoading } = useGetClient(clientId);
  const { data: tasks, isLoading: tasksLoading } = useListTasks({ clientId });
  const { data: dashboard } = useGetDashboard();

  const dashClient = dashboard?.find(c => c.id === clientId);
  const hoursUsed = dashClient?.hours_used_this_month ?? 0;
  const hoursRemaining = dashClient?.hours_remaining ?? (client?.monthly_hour_budget ?? 0);
  const budget = client?.monthly_hour_budget ?? 0;
  const percentage = budget > 0 ? Math.min(100, Math.round((hoursUsed / budget) * 100)) : 0;
  const isOverBudget = hoursUsed >= budget && budget > 0;
  const isNearBudget = percentage >= 85 && !isOverBudget;

  const updateTask = useUpdateTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        toast({ title: "Task updated" });
      },
    },
  });

  const spawnNextTask = useCreateTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        toast({ title: "Next occurrence scheduled" });
      },
    },
  });

  const toggleStatus = (task: Task) => {
    const completing = task.status === "pending";
    updateTask.mutate({ id: task.id, data: { status: completing ? "complete" : "pending" } });

    if (completing && task.recurrence) {
      spawnNextTask.mutate({
        data: {
          title: task.title,
          description: task.description ?? undefined,
          client_id: task.client_id,
          assigned_to: task.assigned_to ?? undefined,
          recurrence: task.recurrence,
          due_date: nextDueDate(task.recurrence),
        },
      });
    }
  };

  const pendingTasks = tasks?.filter(t => t.status === "pending") ?? [];
  const completedTasks = tasks?.filter(t => t.status === "complete") ?? [];

  if (clientLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-32 bg-slate-200 rounded" />
        <div className="h-32 bg-white rounded-2xl border border-slate-100" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white rounded-2xl border border-slate-100" />)}
        </div>
        <div className="h-64 bg-white rounded-2xl border border-slate-100" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-24">
        <p className="text-slate-500">Client not found.</p>
        <button onClick={() => navigate("/clients")} className="mt-4 btn-secondary">Back to Clients</button>
      </div>
    );
  }

  const barColor = isOverBudget ? "bg-red-500" : isNearBudget ? "bg-amber-500" : "bg-blue-500";

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Back */}
      <button
        onClick={() => navigate("/clients")}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Clients
      </button>

      {/* Client Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold shrink-0">
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <span className="flex items-center gap-1.5 text-sm text-slate-500">
                  <Mail className="w-3.5 h-3.5" />
                  {client.email}
                </span>
                <span className="flex items-center gap-1.5 text-sm text-slate-500">
                  <Briefcase className="w-3.5 h-3.5" />
                  <span className="capitalize">{client.service_type}</span>
                </span>
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm text-slate-500">Monthly Fee</p>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(client.monthly_fee)}</p>
          </div>
        </div>
      </div>

      {/* Hours Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Budget</p>
          <p className="text-2xl font-bold text-slate-900">{budget} <span className="text-base font-medium text-slate-400">hrs/mo</span></p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Used This Month</p>
          <p className="text-2xl font-bold text-slate-900">{hoursUsed} <span className="text-base font-medium text-slate-400">hrs</span></p>
        </div>
        <div className={`rounded-2xl border shadow-sm p-5 ${isOverBudget ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
          <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isOverBudget ? "text-red-400" : "text-slate-400"}`}>Remaining</p>
          <p className={`text-2xl font-bold ${isOverBudget ? "text-red-600" : "text-slate-900"}`}>
            {hoursRemaining} <span className="text-base font-medium opacity-60">hrs</span>
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium text-slate-700">{percentage}% of monthly budget used</span>
          <span className="text-slate-500">{hoursUsed} / {budget} hrs</span>
        </div>
        <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${percentage}%` }} />
        </div>
        {isOverBudget && (
          <div className="mt-3 flex items-center gap-2 text-xs font-medium text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
            <AlertCircle className="w-4 h-4 shrink-0" />
            This client has exceeded their monthly hour budget.
          </div>
        )}
      </div>

      {/* Tasks */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Tasks</h2>
        {tasksLoading ? (
          <div className="h-32 bg-white rounded-2xl border border-slate-100 animate-pulse" />
        ) : tasks?.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
            <p className="text-slate-500">No tasks for this client yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Pending */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="font-semibold text-slate-900 text-sm">Pending</span>
                <span className="ml-auto text-xs bg-white text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">{pendingTasks.length}</span>
              </div>
              <div className="p-2">
                {pendingTasks.length === 0 ? (
                  <p className="text-center text-slate-400 py-8 text-sm">All caught up! 🎉</p>
                ) : (
                  <div className="space-y-1">
                    {pendingTasks.map(task => (
                      <div key={task.id} className="flex gap-3 items-start p-3 rounded-xl hover:bg-slate-50 transition-colors">
                        <button
                          onClick={() => toggleStatus(task)}
                          disabled={updateTask.isPending || spawnNextTask.isPending}
                          className="mt-0.5 text-slate-300 hover:text-blue-500 transition-colors shrink-0"
                        >
                          <Circle className="w-5 h-5" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 text-sm">{task.title}</p>
                          {task.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{task.description}</p>}
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            {task.due_date && (
                              <span className="flex items-center gap-1 text-xs text-slate-400">
                                <Calendar className="w-3 h-3" />
                                {new Date(task.due_date + "T00:00:00").toLocaleDateString()}
                              </span>
                            )}
                            {task.assigned_to && (
                              <span className="flex items-center gap-1 text-xs text-slate-400">
                                <UserIcon className="w-3 h-3" />
                                {task.assigned_to}
                              </span>
                            )}
                          </div>
                          <SubtaskList taskId={task.id} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Completed */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden opacity-75 hover:opacity-100 transition-opacity">
              <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-semibold text-slate-900 text-sm">Completed</span>
                <span className="ml-auto text-xs bg-white text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">{completedTasks.length}</span>
              </div>
              <div className="p-2">
                {completedTasks.length === 0 ? (
                  <p className="text-center text-slate-400 py-8 text-sm">No completed tasks yet.</p>
                ) : (
                  <div className="space-y-1">
                    {completedTasks.map(task => (
                      <div key={task.id} className="flex gap-3 items-start p-3 rounded-xl bg-slate-50/50">
                        <button
                          onClick={() => toggleStatus(task)}
                          disabled={updateTask.isPending}
                          className="mt-0.5 text-emerald-500 hover:text-emerald-600 transition-colors shrink-0"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                        </button>
                        <p className="font-medium text-slate-400 line-through text-sm">{task.title}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

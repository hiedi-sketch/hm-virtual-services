import { useState, useEffect } from "react";
import {
  useListTasks,
  useCreateTask,
  useUpdateTask,
  useListClients,
  useSpawnRecurringTasks,
  getListTasksQueryKey,
  TaskStatus,
  Task,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/Modal";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  CheckCircle2,
  Circle,
  Calendar,
  User as UserIcon,
  Filter,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SubtaskList } from "@/components/SubtaskList";

function isWeekday(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

function nextDueDate(recurrence: string): string {
  const d = new Date();
  if (recurrence === "daily") {
    d.setDate(d.getDate() + 1);
  } else if (recurrence === "weekdays") {
    d.setDate(d.getDate() + 1);
    while (!isWeekday(d)) d.setDate(d.getDate() + 1);
  } else if (recurrence === "weekly") {
    d.setDate(d.getDate() + 7);
  } else if (recurrence === "monthly") {
    d.setMonth(d.getMonth() + 1);
  } else if (recurrence === "annually") {
    d.setFullYear(d.getFullYear() + 1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const RECURRENCE_OPTIONS = [
  { value: "", label: "No recurrence" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays (Mon–Fri)" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "annually", label: "Annually" },
];

const RECURRENCE_BADGE: Record<string, string> = {
  daily: "bg-violet-100 text-violet-700",
  weekdays: "bg-orange-100 text-orange-700",
  weekly: "bg-blue-100 text-blue-700",
  monthly: "bg-teal-100 text-teal-700",
  annually: "bg-rose-100 text-rose-700",
};

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  client_id: z.coerce.number().min(1, "Client is required"),
  assigned_to: z.string().optional(),
  due_date: z.string().optional(),
  recurrence: z.enum(["daily", "weekdays", "weekly", "monthly", "annually"]).optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

export default function Tasks() {
  const [selectedClientId, setSelectedClientId] = useState<number | undefined>(undefined);
  const { data: tasks, isLoading } = useListTasks({ clientId: selectedClientId });
  const { data: clients } = useListClients();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidateTasks = () =>
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });

  // Spawn recurring tasks once on mount
  const spawnMutation = useSpawnRecurringTasks({
    mutation: {
      onSuccess: (spawned) => {
        if (spawned.length > 0) {
          invalidateTasks();
          toast({
            title: `${spawned.length} recurring task${spawned.length > 1 ? "s" : ""} generated`,
          });
        }
      },
    },
  });

  useEffect(() => {
    spawnMutation.mutate({});
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createMutation = useCreateTask({
    mutation: {
      onSuccess: () => {
        invalidateTasks();
        setIsModalOpen(false);
        reset();
        toast({ title: "Task created" });
      },
    },
  });

  // Separate mutation for spawning next recurrence — no modal side-effects
  const spawnNextMutation = useCreateTask({
    mutation: {
      onSuccess: () => {
        invalidateTasks();
        toast({ title: "Next occurrence scheduled" });
      },
    },
  });

  const updateMutation = useUpdateTask({
    mutation: {
      onSuccess: () => {
        invalidateTasks();
      },
    },
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = (data: FormValues) => {
    createMutation.mutate({
      data: { ...data, recurrence: data.recurrence || null },
    });
  };

  const toggleStatus = (task: Task) => {
    const completing = task.status === "pending";
    updateMutation.mutate({ id: task.id, data: { status: completing ? "complete" : "pending" } });

    // When completing a recurring task, immediately queue the next occurrence
    if (completing && task.recurrence) {
      spawnNextMutation.mutate({
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

  const pendingTasks = tasks?.filter(t => t.status === "pending") || [];
  const completedTasks = tasks?.filter(t => t.status === "complete") || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Tasks</h1>
          <p className="text-slate-500 mt-1">Manage your to-dos across all clients.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedClientId ?? ""}
              onChange={e => setSelectedClientId(e.target.value ? Number(e.target.value) : undefined)}
              className="text-sm text-slate-700 bg-transparent border-none outline-none cursor-pointer pr-1"
            >
              <option value="">All Clients</option>
              {clients?.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="btn-primary">
            <Plus className="w-5 h-5 mr-2" />
            New Task
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Pending Tasks */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Pending Tasks
              <span className="ml-auto text-xs bg-white text-slate-500 px-2 py-0.5 rounded-full border border-slate-200 shadow-sm">
                {pendingTasks.length}
              </span>
            </h2>
          </div>
          <div className="flex-1 p-2">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400">Loading...</div>
            ) : pendingTasks.length === 0 ? (
              <div className="p-12 text-center text-slate-400">No pending tasks! 🎉</div>
            ) : (
              <div className="space-y-2">
                {pendingTasks.map(task => (
                  <div key={task.id} className="p-4 rounded-xl border border-slate-100 hover:border-blue-100 hover:bg-blue-50/30 transition-colors flex gap-4 group">
                    <button
                      onClick={() => toggleStatus(task)}
                      disabled={updateMutation.isPending || spawnNextMutation.isPending}
                      className="mt-0.5 text-slate-300 hover:text-blue-500 transition-colors shrink-0"
                    >
                      <Circle className="w-6 h-6" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-slate-900">{task.title}</h4>
                      {task.description && (
                        <p className="text-sm text-slate-500 mt-1 line-clamp-2">{task.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="inline-flex items-center text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                          {task.client_name || "Unknown Client"}
                        </span>
                        {task.recurrence && (
                          <span className={cn(
                            "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md",
                            RECURRENCE_BADGE[task.recurrence]
                          )}>
                            <RefreshCw className="w-2.5 h-2.5" />
                            {task.recurrence.charAt(0).toUpperCase() + task.recurrence.slice(1)}
                          </span>
                        )}
                        {task.due_date && (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(task.due_date + "T00:00:00").toLocaleDateString()}
                          </span>
                        )}
                        {task.assigned_to && (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <UserIcon className="w-3.5 h-3.5" />
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

        {/* Completed Tasks */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col opacity-75 hover:opacity-100 transition-opacity">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Completed
              <span className="ml-auto text-xs bg-white text-slate-500 px-2 py-0.5 rounded-full border border-slate-200 shadow-sm">
                {completedTasks.length}
              </span>
            </h2>
          </div>
          <div className="flex-1 p-2">
            {completedTasks.length === 0 ? (
              <div className="p-12 text-center text-slate-400">No completed tasks yet.</div>
            ) : (
              <div className="space-y-2">
                {completedTasks.map(task => (
                  <div key={task.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex gap-4">
                    <button
                      onClick={() => toggleStatus(task)}
                      disabled={updateMutation.isPending}
                      className="mt-0.5 text-emerald-500 hover:text-emerald-600 transition-colors shrink-0"
                    >
                      <CheckCircle2 className="w-6 h-6" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-slate-500 line-through decoration-slate-300">{task.title}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                          {task.client_name}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Task Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="New Task">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label-text">Task Title</label>
            <input {...register("title")} className="input-field" placeholder="Reconcile October accounts" />
            {errors.title && <p className="text-destructive text-xs mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <label className="label-text">Description</label>
            <textarea
              {...register("description")}
              className="input-field min-h-[80px] resize-none"
              placeholder="Add any details or instructions here..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Client</label>
              <select {...register("client_id")} className="input-field">
                <option value="">Select a client...</option>
                {clients?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {errors.client_id && <p className="text-destructive text-xs mt-1">{errors.client_id.message}</p>}
            </div>

            <div>
              <label className="label-text">Due Date (Optional)</label>
              <input type="date" {...register("due_date")} className="input-field" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Assigned To (Optional)</label>
              <input {...register("assigned_to")} className="input-field" placeholder="Jane Doe" />
            </div>

            <div>
              <label className="label-text flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                Recurrence
              </label>
              <select {...register("recurrence")} className="input-field">
                {RECURRENCE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting || createMutation.isPending} className="btn-primary">
              {createMutation.isPending ? "Creating..." : "Create Task"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

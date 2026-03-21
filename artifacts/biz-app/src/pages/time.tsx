import { useState } from "react";
import { useListTimeEntries, useCreateTimeEntry, useListClients, useListTasks, getListTimeEntriesQueryKey, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Clock, Briefcase, Calendar, PlaySquare, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  client_id: z.coerce.number().min(1, "Please select a client"),
  task_id: z.coerce.number().optional().nullable(),
  duration_minutes: z.coerce.number().min(1, "Duration must be at least 1 minute"),
  date: z.string().min(1, "Date is required"),
});

type FormValues = z.infer<typeof formSchema>;

export default function TimeTracking() {
  const { data: entries, isLoading: entriesLoading } = useListTimeEntries();
  const { data: clients } = useListClients();
  const { data: tasks } = useListTasks();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const getTodayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { date: getTodayLocal(), duration_minutes: 15 }
  });

  const selectedClientId = watch("client_id");
  const availableTasks = tasks?.filter(t => t.client_id === selectedClientId && t.status === 'pending') || [];

  const createMutation = useCreateTimeEntry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTimeEntriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        toast({ title: "Time entry logged" });
        reset({ date: getTodayLocal(), duration_minutes: 15, client_id: selectedClientId });
      },
      onError: (err) => {
        toast({ title: "Failed to log time", description: err.message, variant: "destructive" });
      }
    }
  });

  const onSubmit = (data: FormValues) => {
    // Convert empty task_id string/number back to null if needed
    const payload = {
      ...data,
      task_id: data.task_id || null
    };
    createMutation.mutate({ data: payload });
  };

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Time Tracking</h1>
        <p className="text-slate-500 mt-1">Log your billable hours.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Log Form */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sticky top-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-blue-50 p-2 rounded-xl text-blue-600">
                <PlaySquare className="w-5 h-5" />
              </div>
              <h2 className="font-semibold text-slate-900">Log Time</h2>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label className="label-text">Client</label>
                <select {...register("client_id")} className="input-field bg-slate-50">
                  <option value="">Select a client...</option>
                  {clients?.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {errors.client_id && <p className="text-destructive text-xs mt-1">{errors.client_id.message}</p>}
              </div>

              <div>
                <label className="label-text">Related Task (Optional)</label>
                <select 
                  {...register("task_id")} 
                  className="input-field bg-slate-50"
                  disabled={!selectedClientId || availableTasks.length === 0}
                >
                  <option value="">No specific task...</option>
                  {availableTasks.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
                {selectedClientId && availableTasks.length === 0 && (
                  <p className="text-xs text-slate-400 mt-1">No pending tasks for this client.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-text">Duration (mins)</label>
                  <input type="number" {...register("duration_minutes")} className="input-field bg-slate-50" placeholder="60" />
                  {errors.duration_minutes && <p className="text-destructive text-xs mt-1">{errors.duration_minutes.message}</p>}
                </div>
                <div>
                  <label className="label-text">Date</label>
                  <input type="date" {...register("date")} className="input-field bg-slate-50" />
                  {errors.date && <p className="text-destructive text-xs mt-1">{errors.date.message}</p>}
                </div>
              </div>

              <button 
                type="submit" 
                className="btn-primary w-full py-3 mt-4"
                disabled={isSubmitting || createMutation.isPending}
              >
                {isSubmitting || createMutation.isPending ? "Saving..." : "Log Time"}
              </button>
            </form>
          </div>
        </div>

        {/* Recent Entries */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Recent Entries</h2>
              <Clock className="w-5 h-5 text-slate-400" />
            </div>
            
            <div className="divide-y divide-slate-100">
              {entriesLoading ? (
                <div className="p-8 text-center text-slate-400">Loading entries...</div>
              ) : entries?.length === 0 ? (
                <div className="p-12 text-center">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No time entries found</p>
                  <p className="text-sm text-slate-400 mt-1">Log your first entry using the form.</p>
                </div>
              ) : (
                entries?.map(entry => (
                  <div key={entry.id} className="p-5 flex items-start sm:items-center gap-4 hover:bg-slate-50/50 transition-colors">
                    <div className="hidden sm:flex flex-col items-center justify-center w-14 h-14 rounded-full bg-slate-100 text-slate-500 shrink-0">
                      <span className="text-lg font-bold text-slate-700">{formatDuration(entry.duration_minutes).replace(/[^0-9]/g, '')}</span>
                      <span className="text-[10px] font-medium uppercase tracking-wider -mt-1">{formatDuration(entry.duration_minutes).replace(/[0-9\s]/g, '')}</span>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Briefcase className="w-4 h-4 text-primary" />
                        <span className="font-medium text-slate-900">{entry.client_name || 'Unknown Client'}</span>
                      </div>
                      {entry.task_title ? (
                        <p className="text-sm text-slate-600 truncate">{entry.task_title}</p>
                      ) : (
                        <p className="text-sm text-slate-400 italic">General / No task specified</p>
                      )}
                    </div>
                    
                    <div className="text-right shrink-0">
                      <div className="text-sm font-medium text-slate-900 sm:hidden mb-1">
                        {formatDuration(entry.duration_minutes)}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(entry.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

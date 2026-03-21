import { useState } from "react";
import { BarChart2, Download, Clock, CheckSquare, FileText, Loader2, Mail, AlertTriangle, CalendarClock, Users, Timer, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

type ExportFormat = "csv" | "xlsx";

interface ReportDef {
  key: string;
  title: string;
  description: string;
  endpoint: string;
  icon: React.ElementType;
  color: string;
  iconBg: string;
  columns: string[];
}

const REPORTS: ReportDef[] = [
  {
    key: "client-hours",
    title: "Client Hours",
    description: "Hours used and remaining against each client's monthly package budget for the current month.",
    endpoint: "/api/reports/client-hours",
    icon: Clock,
    color: "text-blue-600",
    iconBg: "bg-blue-50",
    columns: ["Client Name", "Service Type", "Package Hours/mo", "Hours Used", "Hours Remaining", "Monthly Fee", "Month"],
  },
  {
    key: "tasks",
    title: "Task Status",
    description: "All tasks across every client with current status, due date, and assignment.",
    endpoint: "/api/reports/tasks",
    icon: CheckSquare,
    color: "text-violet-600",
    iconBg: "bg-violet-50",
    columns: ["Task ID", "Title", "Client", "Status", "Due Date", "Assigned To", "Recurrence"],
  },
  {
    key: "time-entries",
    title: "Time Entries",
    description: "Every logged time entry across all clients with task linkage, duration, and notes.",
    endpoint: "/api/reports/time-entries",
    icon: Timer,
    color: "text-cyan-600",
    iconBg: "bg-cyan-50",
    columns: ["Entry ID", "Date", "Client", "Task", "Duration (min)", "Hours", "Started At", "Ended At"],
  },
  {
    key: "invoices",
    title: "Invoices",
    description: "All invoices with amounts, payment status, due dates, and client details.",
    endpoint: "/api/reports/invoices",
    icon: FileText,
    color: "text-emerald-600",
    iconBg: "bg-emerald-50",
    columns: ["Invoice ID", "Client", "Amount", "Status", "Due Date", "Description"],
  },
  {
    key: "leads",
    title: "CRM Leads",
    description: "All leads in the pipeline with status, estimated value, and follow-up dates.",
    endpoint: "/api/reports/leads",
    icon: TrendingUp,
    color: "text-orange-600",
    iconBg: "bg-orange-50",
    columns: ["Lead ID", "Name", "Email", "Status", "Est. Value", "Follow-up Date", "Notes"],
  },
];

interface NotifDef {
  key: string;
  title: string;
  description: string;
  endpoint: string;
  icon: React.ElementType;
  color: string;
  iconBg: string;
  btnColor: string;
  audience: string;
}

const NOTIFICATIONS: NotifDef[] = [
  {
    key: "overdue-tasks",
    title: "Overdue Task Alerts",
    description: "Emails each client about their overdue pending tasks. Sends admins a full summary table.",
    endpoint: "/api/notifications/overdue-tasks",
    icon: AlertTriangle,
    color: "text-red-600",
    iconBg: "bg-red-50",
    btnColor: "bg-red-600 hover:bg-red-700",
    audience: "Clients + Admins",
  },
  {
    key: "invoice-reminders",
    title: "Invoice Reminders",
    description: "Emails clients with unpaid invoices due within the next 7 days.",
    endpoint: "/api/notifications/invoice-reminders",
    icon: CalendarClock,
    color: "text-amber-600",
    iconBg: "bg-amber-50",
    btnColor: "bg-amber-600 hover:bg-amber-700",
    audience: "Clients",
  },
  {
    key: "followup-reminders",
    title: "Lead Follow-up Reminders",
    description: "Emails admins and team members about leads with overdue or today's follow-up dates.",
    endpoint: "/api/notifications/followup-reminders",
    icon: Users,
    color: "text-indigo-600",
    iconBg: "bg-indigo-50",
    btnColor: "bg-indigo-600 hover:bg-indigo-700",
    audience: "Admins + Team",
  },
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [format, setFormat] = useState<ExportFormat>("csv");
  const { toast } = useToast();

  const handleDownload = async (report: ReportDef) => {
    setDownloading(report.key);
    const date = new Date().toISOString().split("T")[0];
    try {
      const res = await fetch(report.endpoint, { credentials: "include" });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const csvText = await res.text();

      if (format === "xlsx") {
        const wb = XLSX.read(csvText, { type: "string" });
        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([wbout], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        downloadBlob(blob, `${report.key}-${date}.xlsx`);
      } else {
        const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
        downloadBlob(blob, `${report.key}-${date}.csv`);
      }

      toast({ title: `${report.title} exported as ${format.toUpperCase()}` });
    } catch {
      toast({ title: "Export failed", description: "Could not generate the report.", variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  const handleNotify = async (notif: NotifDef) => {
    setSending(notif.key);
    try {
      const res = await fetch(notif.endpoint, { method: "POST", credentials: "include" });
      if (!res.ok) {
        if (res.status === 503) {
          toast({
            title: "SMTP not configured",
            description: "Add your SMTP credentials in environment settings to enable emails.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(`Server error ${res.status}`);
      }
      const data = await res.json() as { sent?: number; tasks?: number; invoices?: number; leads?: number; message?: string };

      if (data.message) {
        toast({ title: "No emails sent", description: data.message });
      } else {
        const recipients = data.sent ?? 0;
        const items = data.tasks ?? data.invoices ?? data.leads ?? 0;
        toast({
          title: `Emails sent`,
          description: `Notified ${recipients} recipient${recipients !== 1 ? "s" : ""} about ${items} item${items !== 1 ? "s" : ""}.`,
        });
      }
    } catch {
      toast({ title: "Failed to send", description: "Could not trigger email notifications.", variant: "destructive" });
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Reports</h1>
          <p className="text-slate-500 mt-1">Generate fresh data exports on demand. Choose your format below.</p>
        </div>

        {/* Format toggle */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 self-start sm:self-auto">
          <button
            onClick={() => setFormat("csv")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              format === "csv"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            CSV
          </button>
          <button
            onClick={() => setFormat("xlsx")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              format === "xlsx"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {REPORTS.map(report => {
          const Icon = report.icon;
          const isLoading = downloading === report.key;
          return (
            <div
              key={report.key}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4"
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl shrink-0 ${report.iconBg}`}>
                  <Icon className={`w-5 h-5 ${report.color}`} />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900">{report.title}</h2>
                  <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{report.description}</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl border border-slate-100 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Columns</p>
                <div className="flex flex-wrap gap-1">
                  {report.columns.map(col => (
                    <span
                      key={col}
                      className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleDownload(report)}
                disabled={isLoading}
                className="mt-auto flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {isLoading ? "Generating…" : `Download ${format.toUpperCase()}`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Email Notifications */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Mail className="w-5 h-5 text-slate-700" />
          <h2 className="text-xl font-display font-bold text-slate-900">Email Notifications</h2>
        </div>
        <p className="text-slate-500 text-sm mb-5">
          Manually trigger batch email notifications. New task emails are sent automatically on task creation.
          Requires SMTP credentials to be configured.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {NOTIFICATIONS.map(notif => {
            const Icon = notif.icon;
            const isLoading = sending === notif.key;
            return (
              <div
                key={notif.key}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4"
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl shrink-0 ${notif.iconBg}`}>
                    <Icon className={`w-5 h-5 ${notif.color}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{notif.title}</h3>
                    <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{notif.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100 w-fit">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs text-slate-500 font-medium">Sends to: {notif.audience}</span>
                </div>

                <button
                  onClick={() => handleNotify(notif)}
                  disabled={isLoading || sending !== null}
                  className={`mt-auto flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${notif.btnColor}`}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4" />
                  )}
                  {isLoading ? "Sending…" : "Send Now"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">About these reports</h2>
        </div>
        <ul className="space-y-1.5 text-sm text-slate-500">
          <li>• <span className="font-medium text-slate-700">Client Hours</span> — reflects time entries logged this calendar month only.</li>
          <li>• <span className="font-medium text-slate-700">Task Status</span> — includes all tasks regardless of status or date.</li>
          <li>• <span className="font-medium text-slate-700">Time Entries</span> — all logged time across every client and task, no date filter.</li>
          <li>• <span className="font-medium text-slate-700">Invoices</span> — includes all invoices in the system, paid and unpaid.</li>
          <li>• <span className="font-medium text-slate-700">CRM Leads</span> — all leads across every pipeline stage.</li>
          <li>• CSV files open in Excel, Google Sheets, or any spreadsheet app. Excel files open natively in Microsoft Excel.</li>
        </ul>
      </div>
    </div>
  );
}

import { useState } from "react";
import { BarChart2, Download, Clock, CheckSquare, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReportDef {
  key: string;
  title: string;
  description: string;
  filename: string;
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
    filename: "client-hours.csv",
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
    filename: "tasks.csv",
    endpoint: "/api/reports/tasks",
    icon: CheckSquare,
    color: "text-violet-600",
    iconBg: "bg-violet-50",
    columns: ["Task ID", "Title", "Client", "Status", "Due Date", "Assigned To", "Recurrence"],
  },
  {
    key: "invoices",
    title: "Invoices",
    description: "All invoices with amounts, payment status, due dates, and client details.",
    filename: "invoices.csv",
    endpoint: "/api/reports/invoices",
    icon: FileText,
    color: "text-emerald-600",
    iconBg: "bg-emerald-50",
    columns: ["Invoice ID", "Client", "Amount", "Status", "Due Date", "Description"],
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
  const { toast } = useToast();

  const handleDownload = async (report: ReportDef) => {
    setDownloading(report.key);
    try {
      const res = await fetch(report.endpoint, { credentials: "include" });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const blob = await res.blob();
      const date = new Date().toISOString().split("T")[0];
      downloadBlob(blob, report.filename.replace(".csv", `-${date}.csv`));
      toast({ title: `${report.title} exported` });
    } catch {
      toast({ title: "Export failed", description: "Could not generate the report.", variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Reports</h1>
        <p className="text-slate-500 mt-1">Download data exports as CSV files. Each report is generated fresh on request.</p>
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
                {isLoading ? "Generating…" : "Download CSV"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">About these reports</h2>
        </div>
        <ul className="space-y-1.5 text-sm text-slate-500">
          <li>• <span className="font-medium text-slate-700">Client Hours</span> — reflects time entries logged this calendar month only.</li>
          <li>• <span className="font-medium text-slate-700">Task Status</span> — includes all tasks regardless of status or date.</li>
          <li>• <span className="font-medium text-slate-700">Invoices</span> — includes all invoices in the system, paid and unpaid.</li>
          <li>• Files open in Excel, Google Sheets, or any spreadsheet app.</li>
        </ul>
      </div>
    </div>
  );
}

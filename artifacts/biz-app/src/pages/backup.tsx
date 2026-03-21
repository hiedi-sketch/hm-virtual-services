import { useState } from "react";
import { Download, FileJson, FileText, Clock, Users, Receipt, CheckSquare, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ExportFormat = "json" | "csv";
type DownloadKey = "json" | "csv-clients" | "csv-tasks" | "csv-invoices";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function triggerDownload(url: string, fallbackFilename: string): Promise<void> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Export failed (${res.status})`);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : fallbackFilename;
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

export default function Backup() {
  const { toast } = useToast();
  const [loading, setLoading] = useState<DownloadKey | null>(null);

  async function download(key: DownloadKey, url: string, fallback: string) {
    setLoading(key);
    try {
      await triggerDownload(url, fallback);
      toast({ title: "Export downloaded" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast({ title: "Export failed", description: msg, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Data Backup</h1>
        <p className="text-slate-500 mt-1">Export your data manually. Downloads are generated fresh each time.</p>
      </div>

      {/* Full JSON Export */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl shrink-0" style={{ backgroundColor: "hsl(188 51% 30% / 0.09)" }}>
            <FileJson className="w-6 h-6" style={{ color: "#266b75" }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Full Data Export</h2>
            <p className="text-sm text-slate-500 mt-1">
              All records from every table — clients, tasks, invoices, time entries, and leads — exported as a single structured JSON file. Use this to migrate or archive your data.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Clients</span>
              <span className="flex items-center gap-1"><CheckSquare className="w-3 h-3" /> Tasks</span>
              <span className="flex items-center gap-1"><Receipt className="w-3 h-3" /> Invoices</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Time entries</span>
            </div>
          </div>
          <button
            onClick={() => download("json", `${BASE}/api/backup/json`, `flowstate-full-export-${today}.json`)}
            disabled={loading !== null}
            className="btn-primary shrink-0 gap-2 text-sm"
          >
            <Download className={`w-4 h-4 ${loading === "json" ? "animate-bounce" : ""}`} />
            {loading === "json" ? "Exporting…" : "Download JSON"}
          </button>
        </div>
      </div>

      {/* CSV exports */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Individual CSV Exports</h2>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {[
            {
              key: "csv-clients" as DownloadKey,
              icon: Users,
              label: "Clients",
              desc: "Name, email, service type, fees, and hour budgets for all clients",
              url: `${BASE}/api/backup/csv/clients`,
              filename: `flowstate-clients-${today}.csv`,
            },
            {
              key: "csv-tasks" as DownloadKey,
              icon: CheckSquare,
              label: "Tasks",
              desc: "All tasks with title, status, due date, client ID, and assignee",
              url: `${BASE}/api/backup/csv/tasks`,
              filename: `flowstate-tasks-${today}.csv`,
            },
            {
              key: "csv-invoices" as DownloadKey,
              icon: Receipt,
              label: "Invoices",
              desc: "All invoices with amount, status, due date, and client ID",
              url: `${BASE}/api/backup/csv/invoices`,
              filename: `flowstate-invoices-${today}.csv`,
            },
          ].map(({ key, icon: Icon, label, desc, url, filename }) => (
            <div key={key} className="flex items-center gap-4 px-6 py-4">
              <div className="p-2 rounded-lg bg-slate-50 shrink-0">
                <Icon className="w-4 h-4 text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900">{label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
              </div>
              <button
                onClick={() => download(key, url, filename)}
                disabled={loading !== null}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                <FileText className={`w-3.5 h-3.5 ${loading === key ? "animate-bounce" : ""}`} />
                {loading === key ? "Exporting…" : `Export CSV`}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Info note */}
      <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        <Shield className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
        <p className="text-sm text-slate-500">
          Exports are generated on demand and are only accessible to admins. No automatic backups are scheduled — download manually whenever you need a snapshot.
        </p>
      </div>
    </div>
  );
}

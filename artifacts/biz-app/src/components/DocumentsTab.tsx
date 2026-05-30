import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, FileText, FileImage, File, Download, Trash2, AlertCircle, CloudUpload, Loader2, X, Eye, ClipboardList,
} from "lucide-react";
import { PdfViewer } from "@/components/PdfViewer";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type FileUploadRecord = {
  id: number;
  client_id: number;
  uploaded_by_user_id: number | null;
  original_name: string;
  stored_name: string;
  mimetype: string;
  size_bytes: number;
  created_at: string;
  document_type?: string | null;
  document_status?: string | null;
};

type OnboardingData = {
  services?: string; industry?: string;
  bk_software?: string; bk_existing_accounts?: string; bk_fiscal_year_end?: string;
  bk_accounting_basis?: string; bk_business_bank_account?: string; bk_notes?: string;
  va_task_types?: string | string[]; va_tools?: string; va_communication?: string; va_availability?: string;
  access_notes?: string; goals?: string; other_notes?: string;
  submitted_at?: string;
};

function OnboardingFormModal({ clientId, onClose }: { clientId: number; onClose: () => void }) {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/clients/${clientId}/onboarding-data`, { credentials: "include" })
      .then(async r => {
        const json = await r.json().catch(() => ({}));
        if (!r.ok) { setError(json.error ?? "Failed to load"); } else { setData(json); }
      })
      .catch(() => setError("Failed to load onboarding data"))
      .finally(() => setLoading(false));
  }, [clientId]);

  const Row = ({ label, value }: { label: string; value?: string | string[] | null }) => {
    if (!value || (Array.isArray(value) && value.length === 0)) return null;
    const display = Array.isArray(value) ? value.join(", ")
      : (typeof value === "string" && value.startsWith("[")) ? (() => { try { return JSON.parse(value).join(", "); } catch { return value; } })()
      : value;
    return (
      <div className="flex gap-3 text-sm py-1.5 border-b border-slate-50">
        <span className="text-slate-400 shrink-0 w-40">{label}</span>
        <span className="text-slate-800 font-medium">{display}</span>
      </div>
    );
  };

  const hasBK = data?.services === "bookkeeping" || data?.services === "both";
  const hasVA = data?.services === "va" || data?.services === "both";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full max-w-2xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="font-semibold text-slate-900">Completed Onboarding Form</h3>
            {data?.submitted_at && (
              <p className="text-xs text-slate-400 mt-0.5">Submitted {new Date(data.submitted_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 text-[#266b75] animate-spin" /></div>
          ) : error ? (
            <div className="text-center py-8 text-red-500 text-sm">{error}</div>
          ) : data ? (
            <>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#266b75] mb-2">Service</p>
                <Row label="Service Type" value={data.services === "bookkeeping" ? "Bookkeeping" : data.services === "va" ? "Virtual Assistant" : data.services === "both" ? "Bookkeeping & VA" : data.services} />
                <Row label="Industry" value={data.industry} />
              </div>
              {hasBK && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#266b75] mb-2">Bookkeeping</p>
                  <Row label="Software" value={data.bk_software} />
                  <Row label="Existing accounts" value={data.bk_existing_accounts} />
                  <Row label="Fiscal year end" value={data.bk_fiscal_year_end} />
                  <Row label="Accounting basis" value={data.bk_accounting_basis} />
                  <Row label="Business bank acct" value={data.bk_business_bank_account} />
                  {data.bk_notes && (
                    <div className="text-sm pt-1">
                      <span className="text-slate-400">Notes</span>
                      <p className="mt-1 text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg px-3 py-2">{data.bk_notes}</p>
                    </div>
                  )}
                </div>
              )}
              {hasVA && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#266b75] mb-2">Virtual Assistant</p>
                  <Row label="Task types" value={data.va_task_types} />
                  <Row label="Tools" value={data.va_tools} />
                  <Row label="Communication" value={data.va_communication} />
                  <Row label="Availability" value={data.va_availability} />
                </div>
              )}
              {data.access_notes && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#266b75] mb-2">Access & Logins</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg px-3 py-2">{data.access_notes}</p>
                </div>
              )}
              {data.goals && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#266b75] mb-2">Goals</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg px-3 py-2">{data.goals}</p>
                  {data.other_notes && <p className="text-sm text-slate-500 italic whitespace-pre-wrap mt-2">{data.other_notes}</p>}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const ALLOWED_TYPES = "application/pdf,image/jpeg,image/png,image/gif,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function FileIcon({ mimetype, className }: { mimetype: string; className?: string }) {
  const cls = className ?? "w-5 h-5";
  if (mimetype.startsWith("image/")) return <FileImage className={cn(cls, "text-blue-500")} />;
  if (mimetype === "application/pdf")  return <FileText  className={cn(cls, "text-red-500")} />;
  return <File className={cn(cls, "text-slate-400")} />;
}

function isPreviewable(mimetype: string) {
  return mimetype.startsWith("image/") || mimetype === "application/pdf";
}

// ─── Preview Modal ─────────────────────────────────────────────────────────────
function PreviewModal({ file, onClose }: { file: FileUploadRecord; onClose: () => void }) {
  const previewUrl = `/api/uploads/${file.id}/preview`;
  const isImage = file.mimetype.startsWith("image/");
  const isPdf   = file.mimetype === "application/pdf";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: "min(90vw, 960px)", height: "min(90vh, 720px)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileIcon mimetype={file.mimetype} className="w-4 h-4 shrink-0" />
            <span className="text-sm font-semibold text-slate-800 truncate">{file.original_name}</span>
            <span className="text-xs text-slate-400 shrink-0">{formatBytes(file.size_bytes)}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <a
              href={`/api/uploads/${file.id}/download`}
              download={file.original_name}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              onClick={e => e.stopPropagation()}
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-slate-50 flex items-center justify-center">
          {isImage && (
            <img
              src={previewUrl}
              alt={file.original_name}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          )}
          {isPdf && <PdfViewer url={previewUrl} />}
        </div>
      </div>
    </div>
  );
}

interface Props {
  clientId?: number;
}

export function DocumentsTab({ clientId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileUploadRecord | null>(null);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);

  const qKey = ["uploads", clientId ?? "mine"];

  const { data: files = [], isLoading } = useQuery<FileUploadRecord[]>({
    queryKey: qKey,
    queryFn: async () => {
      const qs = clientId ? `?client_id=${clientId}` : "";
      const res = await fetch(`/api/uploads${qs}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      if (clientId) fd.append("client_id", String(clientId));
      const res = await fetch("/api/uploads", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast({ title: "File uploaded successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/uploads/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
      toast({ title: "File deleted" });
    },
    onError: () => {
      toast({ title: "Delete failed", variant: "destructive" });
    },
  });

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    Array.from(fileList).forEach(f => uploadMutation.mutate(f));
  }

  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-5">
      {/* Drop zone */}
      <div
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer",
          dragging ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
        )}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_TYPES}
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
        {uploadMutation.isPending ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-9 h-9 text-blue-400 animate-spin" />
            <p className="text-sm font-medium text-blue-600">Uploading…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-2xl">
              <CloudUpload className={cn("w-8 h-8", dragging ? "text-blue-600" : "text-blue-400")} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Drop files here or click to browse</p>
              <p className="text-xs text-slate-400 mt-1">
                PDF, Word, Excel, CSV, images, TXT · Max 10 MB per file
              </p>
            </div>
          </div>
        )}
      </div>

      {/* File list */}
      {isLoading ? (
        <div className="text-center py-8 text-slate-400 animate-pulse text-sm">Loading files…</div>
      ) : files.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-2xl border border-slate-200">
          <Upload className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500">No files yet</p>
          <p className="text-xs text-slate-400 mt-0.5">Upload receipts, documents, or any relevant files above.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">
              {files.length} file{files.length !== 1 ? "s" : ""}
            </span>
          </div>
          <ul className="divide-y divide-slate-50">
            {files.map(f => {
              const isOnboardingForm = f.mimetype === "application/x-onboarding-form";
              return (
                <li
                  key={f.id}
                  className="flex items-center gap-3 px-5 py-3.5 group hover:bg-slate-50/60 transition-colors"
                >
                  {isOnboardingForm ? (
                    <ClipboardList className="w-5 h-5 text-[#266b75]" />
                  ) : (
                    <FileIcon mimetype={f.mimetype} />
                  )}
                  <div
                    className={cn("flex-1 min-w-0", (isPreviewable(f.mimetype) || isOnboardingForm) && "cursor-pointer")}
                    onClick={() => {
                      if (isOnboardingForm) setShowOnboardingModal(true);
                      else if (isPreviewable(f.mimetype)) setPreviewFile(f);
                    }}
                  >
                    <p className={cn(
                      "text-sm font-medium text-slate-800 truncate",
                      (isPreviewable(f.mimetype) || isOnboardingForm) && "group-hover:text-[#266b75] transition-colors"
                    )}>
                      {f.original_name}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {isOnboardingForm
                        ? `Completed · ${formatDate(f.created_at)}${f.document_status ? ` · ${f.document_status}` : ""}`
                        : `${formatBytes(f.size_bytes)} · ${formatDate(f.created_at)}`
                      }
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isOnboardingForm ? (
                      <button
                        onClick={() => setShowOnboardingModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#266b75] hover:bg-[#266b75]/10 border border-[#266b75]/20 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>
                    ) : (
                      <>
                        {isPreviewable(f.mimetype) && (
                          <button
                            onClick={() => setPreviewFile(f)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#266b75] hover:bg-[#266b75]/10 transition-colors"
                            title="Preview"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        <a
                          href={`/api/uploads/${f.id}/download`}
                          download={f.original_name}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Download"
                          onClick={e => e.stopPropagation()}
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${f.original_name}"?`)) deleteMutation.mutate(f.id);
                        }}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-xs text-slate-400 text-center flex items-center justify-center gap-1">
        <AlertCircle className="w-3 h-3" />
        Files are stored securely and only visible to you and your account team.
      </p>

      {/* Preview modal */}
      {previewFile && (
        <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}

      {/* Onboarding form modal */}
      {showOnboardingModal && clientId && (
        <OnboardingFormModal clientId={clientId} onClose={() => setShowOnboardingModal(false)} />
      )}
    </div>
  );
}

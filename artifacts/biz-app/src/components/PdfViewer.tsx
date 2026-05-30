import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { ChevronLeft, ChevronRight, Loader2, AlertCircle } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface Props {
  /** URL or blob URL for the PDF — served with credentials if needed */
  url: string;
  /** Whether to fetch with credentials (default true) */
  withCredentials?: boolean;
}

export function PdfViewer({ url, withCredentials = true }: Props) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center w-full h-full overflow-auto bg-slate-100 py-4 gap-3">
      <Document
        file={{ url, withCredentials }}
        onLoadSuccess={({ numPages }) => { setNumPages(numPages); setPage(1); setError(null); }}
        onLoadError={err => setError(err.message)}
        loading={
          <div className="flex flex-col items-center gap-3 mt-16 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-sm">Loading PDF…</span>
          </div>
        }
        error={
          <div className="flex flex-col items-center gap-3 mt-16 text-slate-500">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <span className="text-sm font-medium">Could not load PDF</span>
            {error && <span className="text-xs text-slate-400 max-w-xs text-center">{error}</span>}
          </div>
        }
      >
        <Page
          pageNumber={page}
          width={Math.min(window.innerWidth * 0.8, 880)}
          className="shadow-lg rounded-lg overflow-hidden"
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>

      {numPages && numPages > 1 && (
        <div className="flex items-center gap-3 bg-white rounded-xl shadow px-4 py-2 text-sm font-medium text-slate-700 select-none sticky bottom-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span>{page} / {numPages}</span>
          <button
            onClick={() => setPage(p => Math.min(numPages, p + 1))}
            disabled={page >= numPages}
            className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

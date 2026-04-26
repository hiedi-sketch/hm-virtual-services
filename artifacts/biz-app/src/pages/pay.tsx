import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle, AlertCircle, Lock, CreditCard, RefreshCw } from "lucide-react";

declare global {
  interface Window {
    Square?: any;
  }
}

interface InvoiceData {
  id: number;
  status: string;
  amount: number;
  description: string | null;
  line_items: Array<{ name: string; qty: number; unit_price: number }> | null;
  notes: string | null;
  due_date: string;
  client_name: string | null;
  autopay_enabled: boolean;
  has_card_on_file: boolean;
  square: {
    applicationId: string;
    locationId: string;
    scriptSrc: string;
  } | null;
  already_paid?: boolean;
}

function fmtAmount(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export default function PayPage() {
  const [location] = useLocation();
  const token = location.startsWith("/pay/") ? location.slice(5).split("?")[0] : null;
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const cardRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [saveAutopay, setSaveAutopay] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ receiptUrl: string | null; autopay: boolean } | null>(null);

  // Fetch invoice data
  useEffect(() => {
    if (!token) return;
    fetch(`/api/pay/${token}`)
      .then(r => r.json())
      .then((data: any) => {
        if (data.error) { setError(data.error); return; }
        setInvoice(data);
      })
      .catch(() => setError("Failed to load invoice. Please try again."))
      .finally(() => setLoading(false));
  }, [token]);

  // Load Square Web Payments SDK and initialize card form
  useEffect(() => {
    if (!invoice?.square || invoice.already_paid) return;
    const { applicationId, locationId, scriptSrc } = invoice.square;
    if (!applicationId) {
      setSdkError("Payment form is not configured. Please contact support.");
      return;
    }

    let card: any;

    loadScript(scriptSrc)
      .then(async () => {
        if (!window.Square) throw new Error("Square SDK not available");
        const payments = window.Square.payments(applicationId, locationId);
        card = await payments.card({
          style: {
            ".input-container": {
              borderColor: "#e2e8f0",
              borderRadius: "8px",
            },
            ".input-container.is-focus": {
              borderColor: "#266b75",
            },
            ".input-container.is-error": {
              borderColor: "#ef4444",
            },
            ".message-text": { color: "#64748b" },
            ".message-icon": { color: "#64748b" },
            ".message-text.is-error": { color: "#ef4444" },
            ".message-icon.is-error": { color: "#ef4444" },
            input: {
              backgroundColor: "#ffffff",
              color: "#0f172a",
              fontFamily: "inherit",
              fontSize: "15px",
            },
            "input::placeholder": { color: "#94a3b8" },
          },
        });
        if (containerRef.current) {
          await card.attach(containerRef.current);
          cardRef.current = card;
          setSdkReady(true);
        }
      })
      .catch((err) => {
        setSdkError(err.message ?? "Failed to load payment form.");
      });

    return () => {
      card?.destroy?.();
    };
  }, [invoice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardRef.current || !token) return;
    setSubmitting(true);
    setPayError(null);

    try {
      const result = await cardRef.current.tokenize();
      if (result.status !== "OK") {
        const msg = result.errors?.[0]?.message ?? "Card tokenization failed. Please check your card details.";
        setPayError(msg);
        setSubmitting(false);
        return;
      }

      const res = await fetch(`/api/pay/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce: result.token, saveAutopay }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setPayError(data.error ?? "Payment failed. Please try again.");
        setSubmitting(false);
        return;
      }

      setSuccess({ receiptUrl: data.receipt_url, autopay: data.autopay_activated });
    } catch {
      setPayError("An unexpected error occurred. Please try again.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <p className="text-sm">Loading invoice…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Invoice Not Found</h2>
          <p className="text-slate-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (invoice?.already_paid || invoice?.status === "paid") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Already Paid</h2>
          <p className="text-slate-500 text-sm">This invoice has already been paid. Thank you!</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-[#266b75]/10 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-8 h-8 text-[#266b75]" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Payment Successful</h2>
          <p className="text-slate-500 text-sm mb-6">
            Thank you! Your payment for Invoice #{invoice?.id} has been received.
            A receipt has been sent to your email.
          </p>
          {success.autopay && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5 text-left">
              <p className="text-sm font-semibold text-green-800 mb-1">✓ Autopay Activated</p>
              <p className="text-xs text-green-700">
                Your card has been saved. Future recurring invoices will be charged automatically — no action needed.
              </p>
            </div>
          )}
          {success.receiptUrl && (
            <a
              href={success.receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm text-[#266b75] font-medium hover:underline"
            >
              View Square Receipt →
            </a>
          )}
          <p className="text-xs text-slate-400 mt-6">Powered by Square · HM Virtual Services</p>
        </div>
      </div>
    );
  }

  const lineItems = invoice?.line_items ?? [];

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-sm font-semibold text-[#266b75] tracking-widest uppercase mb-1">HM Virtual Services</p>
          <h1 className="text-2xl font-bold text-slate-900">Invoice #{invoice?.id}</h1>
          {invoice?.client_name && (
            <p className="text-slate-500 text-sm mt-1">Hi {invoice.client_name} — please complete your payment below.</p>
          )}
        </div>

        {/* Invoice summary card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-5 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="flex justify-between items-start">
              <div>
                {invoice?.description && (
                  <p className="text-sm text-slate-600">{invoice.description}</p>
                )}
                {invoice?.due_date && (
                  <p className="text-xs text-slate-400 mt-0.5">Due {fmtDate(invoice.due_date)}</p>
                )}
              </div>
              <span className="text-2xl font-bold text-slate-900">
                {fmtAmount(invoice?.amount ?? 0)}
              </span>
            </div>
          </div>

          {lineItems.length > 0 && (
            <div className="px-6 py-3 space-y-2">
              {lineItems.map((li, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-slate-600">{li.name}{li.qty !== 1 ? ` ×${li.qty}` : ""}</span>
                  <span className="text-slate-800 font-medium">{fmtAmount(li.qty * li.unit_price)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="px-6 py-4 bg-slate-900 flex justify-between items-center">
            <span className="text-slate-400 text-sm">Total Due</span>
            <span className="text-white text-xl font-bold">{fmtAmount(invoice?.amount ?? 0)}</span>
          </div>
        </div>

        {/* Payment form */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#266b75]" />
            Payment Details
          </h2>

          {sdkError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">
              {sdkError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Square card element */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">
                Card Information
              </label>
              {!sdkReady && !sdkError && (
                <div className="h-[54px] bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />
                </div>
              )}
              <div
                ref={containerRef}
                id="card-container"
                className={sdkReady ? "" : "hidden"}
              />
            </div>

            {/* Autopay option */}
            <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-slate-200 hover:border-[#266b75]/40 cursor-pointer transition-colors group">
              <input
                type="checkbox"
                checked={saveAutopay}
                onChange={e => setSaveAutopay(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-[#266b75] focus:ring-[#266b75]"
              />
              <div>
                <p className="text-sm font-semibold text-slate-800 group-hover:text-slate-900">
                  Save card for autopay
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automatically charge this card for future recurring invoices. Cancel anytime by contacting us.
                </p>
              </div>
            </label>

            {payError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {payError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !sdkReady}
              className="w-full bg-[#266b75] hover:bg-[#1e555e] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-base py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Pay {fmtAmount(invoice?.amount ?? 0)}
                </>
              )}
            </button>

            <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
              <Lock className="w-3 h-3" />
              Secured by Square · Your card info is never stored on our servers
            </p>
          </form>
        </div>

        {invoice?.notes && (
          <p className="text-xs text-slate-500 mt-4 text-center px-4">{invoice.notes}</p>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Check, ThumbsDown, FileText, X, CreditCard, Send, CheckCircle2, AlertCircle } from "lucide-react";

function fmtCurrency(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

type Estimate = {
  id: number;
  status: string;
  amount: number;
  description: string | null;
  line_items: Array<{ name: string; description?: string; qty: number; unit_price: number }> | null;
  notes: string | null;
  thank_you_message: string | null;
  due_date: string;
  client_name: string | null;
};

export default function EstimateResponsePage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";
  const initialAction = params.get("action") as "accept" | "decline" | null;
  const paymentSuccess = params.get("payment") === "success";

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"choose" | "accept" | "decline">(
    paymentSuccess ? "choose" : (initialAction ?? "choose")
  );
  const [done, setDone] = useState<"accepted" | "declined" | "paid" | null>(
    paymentSuccess ? "paid" : null
  );

  useEffect(() => {
    if (!token) {
      setError("No token provided. Please use the link from your email.");
      setLoading(false);
      return;
    }
    fetch(`/api/estimate-response/${token}`, { credentials: "omit" })
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? "Estimate not found or link has expired.");
        }
        return r.json();
      })
      .then(data => {
        setEstimate(data);
        // If already actioned, show the done state
        if (data.status === "accepted") setDone("accepted");
        if (data.status === "declined") setDone("declined");
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f9f9f7", fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div className="flex justify-center pt-8 pb-4">
        <img src="/hm-logo-full.png" alt="HM Virtual Services" className="h-24 object-contain" />
      </div>

      <div className="max-w-xl mx-auto px-4 pb-16">
        {loading && (
          <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-[#266b75] rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Link not found</h2>
            <p className="text-sm text-slate-500">{error}</p>
            <p className="text-xs text-slate-400 mt-3">If you think this is an error, please contact us directly.</p>
          </div>
        )}

        {!loading && estimate && (
          <>
            {/* Estimate summary card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
              <div className="px-6 py-5 border-b border-slate-100">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#266b75]/10 text-[#266b75]">
                    Estimate #{estimate.id}
                  </span>
                  {estimate.status === "accepted" && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Accepted</span>
                  )}
                  {estimate.status === "declined" && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Changes Requested</span>
                  )}
                  {estimate.status === "sent" && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Awaiting Response</span>
                  )}
                </div>
                {estimate.description && (
                  <p className="text-base font-semibold text-slate-900 mt-1">{estimate.description}</p>
                )}
                {estimate.client_name && (
                  <p className="text-sm text-slate-500 mt-0.5">Prepared for {estimate.client_name}</p>
                )}
              </div>

              {/* Line items */}
              {estimate.line_items && estimate.line_items.length > 0 && (
                <div className="px-6 py-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        <th className="text-left pb-2 font-medium">Service</th>
                        <th className="text-center pb-2 font-medium">Qty</th>
                        <th className="text-right pb-2 font-medium">Rate</th>
                        <th className="text-right pb-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {estimate.line_items.map((li, i) => (
                        <tr key={i} className="text-slate-700">
                          <td className="py-2.5 pr-4">
                            <p className="font-medium">{li.name}</p>
                            {li.description && <p className="text-xs text-slate-400 mt-0.5">{li.description}</p>}
                          </td>
                          <td className="py-2.5 text-center text-slate-500">{li.qty}</td>
                          <td className="py-2.5 text-right text-slate-500">{fmtCurrency(li.unit_price)}</td>
                          <td className="py-2.5 text-right font-semibold">{fmtCurrency(li.qty * li.unit_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Total */}
              <div className="px-6 py-4 bg-slate-900 flex items-center justify-between">
                <span className="text-sm text-slate-400">Total</span>
                <span className="text-2xl font-bold text-white">{fmtCurrency(estimate.amount)}</span>
              </div>

              {estimate.notes && (
                <div className="px-6 py-4 border-t border-slate-100">
                  <p className="text-sm text-slate-500">{estimate.notes}</p>
                </div>
              )}
              {estimate.thank_you_message && (
                <div className="px-6 pb-4">
                  <p className="text-sm text-slate-500 italic">{estimate.thank_you_message}</p>
                </div>
              )}
            </div>

            {/* Action area */}
            {done === "paid" && (
              <DoneCard
                icon={<CreditCard className="w-7 h-7 text-[#266b75]" />}
                iconBg="bg-[#266b75]/10"
                title="Payment complete!"
                message="Thank you! Your services are confirmed and your invoice has been paid. We'll be in touch shortly."
              />
            )}
            {done === "accepted" && estimate.status !== "sent" && (
              <DoneCard
                icon={<CheckCircle2 className="w-7 h-7 text-emerald-600" />}
                iconBg="bg-emerald-100"
                title="You're all set!"
                message="Your services have been confirmed. We look forward to working with you!"
              />
            )}
            {done === "declined" && estimate.status !== "sent" && (
              <DoneCard
                icon={<Send className="w-6 h-6 text-slate-600" />}
                iconBg="bg-slate-100"
                title="Feedback received!"
                message="Thank you for your response. We'll review your feedback and be in touch shortly with an updated proposal."
              />
            )}

            {!done && estimate.status === "sent" && view === "choose" && (
              <ChooseView onAccept={() => setView("accept")} onDecline={() => setView("decline")} />
            )}
            {!done && estimate.status === "sent" && view === "accept" && (
              <AcceptView
                token={token}
                estimateId={estimate.id}
                onBack={() => setView("choose")}
                onDone={(result) => setDone(result)}
              />
            )}
            {!done && estimate.status === "sent" && view === "decline" && (
              <DeclineView
                token={token}
                estimateId={estimate.id}
                onBack={() => setView("choose")}
                onDone={() => setDone("declined")}
              />
            )}

            {/* Already responded */}
            {!done && estimate.status !== "sent" && estimate.status !== "accepted" && estimate.status !== "declined" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center">
                <p className="text-sm text-slate-500">This estimate is no longer available for response.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DoneCard({ icon, iconBg, title, message }: { icon: React.ReactNode; iconBg: string; title: string; message: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
      <div className={`w-14 h-14 rounded-full ${iconBg} flex items-center justify-center mx-auto mb-4`}>
        {icon}
      </div>
      <h2 className="text-lg font-bold text-slate-900 mb-2">{title}</h2>
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

function ChooseView({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <p className="text-sm font-semibold text-slate-700 text-center mb-5">
        Please review the estimate above and let us know how you'd like to proceed:
      </p>
      <div className="space-y-3">
        <button
          onClick={onAccept}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3.5 rounded-xl text-sm font-bold transition-colors"
        >
          <Check className="w-4 h-4" />
          Accept &amp; Get Started
        </button>
        <button
          onClick={onDecline}
          className="w-full flex items-center justify-center gap-2 border-2 border-slate-200 text-slate-600 hover:bg-slate-50 px-6 py-3.5 rounded-xl text-sm font-semibold transition-colors"
        >
          <ThumbsDown className="w-4 h-4" />
          Request Changes
        </button>
      </div>
    </div>
  );
}

function AcceptView({
  token, estimateId, onBack, onDone,
}: {
  token: string; estimateId: number; onBack: () => void; onDone: (result: "accepted" | "paid") => void;
}) {
  const [startType, setStartType] = useState<"immediate" | "future">("immediate");
  const [startDate, setStartDate] = useState("");
  const [payment, setPayment] = useState<"pay_now" | "request_invoice">("pay_now");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayStr = new Date().toLocaleDateString("sv-SE");

  async function handleSubmit() {
    if (startType === "future" && !startDate) {
      setError("Please choose a start date.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/estimate-response/${token}/start-services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({
          start_type: startType,
          start_date: startType === "future" ? startDate : undefined,
          payment,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Something went wrong");
      }
      const data = await res.json();
      if (data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }
      onDone("accepted");
    } catch (e: any) {
      setError(e.message ?? "Could not process request");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-base font-bold text-slate-900">Accept &amp; Get Started</h2>
          <p className="text-xs text-slate-500">Choose when you'd like services to begin</p>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Start type */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-3">When would you like to start?</p>
          <div className="space-y-2">
            <label className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${startType === "immediate" ? "border-[#266b75] bg-[#266b75]/5" : "border-slate-200 hover:border-slate-300"}`}>
              <input type="radio" className="accent-[#266b75]" checked={startType === "immediate"} onChange={() => setStartType("immediate")} />
              <div>
                <p className="text-sm font-semibold text-slate-800">Start Immediately</p>
                <p className="text-xs text-slate-500">Services begin tomorrow</p>
              </div>
            </label>
            <label className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${startType === "future" ? "border-[#266b75] bg-[#266b75]/5" : "border-slate-200 hover:border-slate-300"}`}>
              <input type="radio" className="accent-[#266b75]" checked={startType === "future"} onChange={() => setStartType("future")} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">Choose a Start Date</p>
                <p className="text-xs text-slate-500">Pick a future date</p>
              </div>
            </label>
            {startType === "future" && (
              <div className="ml-4 mt-2">
                <input
                  type="date"
                  min={todayStr}
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Payment */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-3">How would you like to pay for the first month?</p>
          <div className="space-y-2">
            <label className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${payment === "pay_now" ? "border-[#266b75] bg-[#266b75]/5" : "border-slate-200 hover:border-slate-300"}`}>
              <input type="radio" className="accent-[#266b75]" checked={payment === "pay_now"} onChange={() => setPayment("pay_now")} />
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#266b75]" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">Pay Now</p>
                  <p className="text-xs text-slate-500">Secure payment via Stripe — card required</p>
                </div>
              </div>
            </label>
            <label className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${payment === "request_invoice" ? "border-[#266b75] bg-[#266b75]/5" : "border-slate-200 hover:border-slate-300"}`}>
              <input type="radio" className="accent-[#266b75]" checked={payment === "request_invoice"} onChange={() => setPayment("request_invoice")} />
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">Request Invoice</p>
                  <p className="text-xs text-slate-500">We'll send an invoice to your email</p>
                </div>
              </div>
            </label>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onBack}
            className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-3 rounded-xl text-sm font-semibold transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-[#266b75] hover:bg-[#1d525a] text-white px-4 py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? "Processing…" : payment === "pay_now" ? "Proceed to Payment" : "Confirm & Request Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeclineView({
  token, estimateId, onBack, onDone,
}: {
  token: string; estimateId: number; onBack: () => void; onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!reason.trim()) {
      setError("Please share your feedback before submitting.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/estimate-response/${token}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Something went wrong");
      }
      onDone();
    } catch (e: any) {
      setError(e.message ?? "Could not submit feedback");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-base font-bold text-slate-900">Request Changes</h2>
          <p className="text-xs text-slate-500">Tell us how we can adjust the proposal</p>
        </div>
      </div>

      <div className="px-6 py-6 space-y-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-2">
            What would you like us to change or adjust?
          </label>
          <textarea
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 resize-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] outline-none"
            rows={5}
            placeholder="e.g. I'd like to adjust the scope, pricing, or start date…"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
          <p className="text-xs text-slate-400 mt-1">Your feedback goes directly to our team and we'll be in touch shortly.</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onBack}
            className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-3 rounded-xl text-sm font-semibold transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !reason.trim()}
            className="flex-1 bg-slate-800 hover:bg-slate-900 text-white px-4 py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {loading ? "Sending…" : "Send Feedback"}
          </button>
        </div>
      </div>
    </div>
  );
}

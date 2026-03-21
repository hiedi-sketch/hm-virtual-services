import { useState } from "react";
import { Briefcase, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";

function validateEmail(email: string): string | null {
  if (!email.trim()) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address";
  return null;
}

export default function ForgotPassword() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState("");

  function handleBlur() {
    setEmailError(validateEmail(email) ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateEmail(email);
    if (err) {
      setEmailError(err);
      return;
    }
    setEmailError("");
    setServerError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setServerError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-primary/10 p-3 rounded-xl mb-3">
            <Briefcase className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Flowstate</h1>
          <p className="text-slate-500 text-sm mt-1">Reset your password</p>
        </div>

        {sent ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="bg-emerald-50 p-3 rounded-xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 text-lg">Check your email</h2>
              <p className="text-sm text-slate-500 mt-2">
                If <span className="font-medium text-slate-700">{email}</span> is registered, you'll receive a reset link shortly. The link expires in 1 hour.
              </p>
            </div>
            <p className="text-xs text-slate-400">
              Didn't receive an email? Check your spam folder or{" "}
              <button
                onClick={() => { setSent(false); setEmail(""); }}
                className="text-primary font-medium hover:underline"
              >
                try again
              </button>
              .
            </p>
            <button
              onClick={() => navigate("/")}
              className="w-full mt-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <p className="text-sm text-slate-600">
              Enter the email address associated with your account and we'll send you a link to reset your password.
            </p>

            {serverError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                {serverError}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700" htmlFor="email">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(""); }}
                  onBlur={handleBlur}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors ${
                    emailError
                      ? "border-red-300 focus:ring-red-200 focus:border-red-400"
                      : "border-slate-200 focus:ring-primary/30 focus:border-primary"
                  }`}
                />
              </div>
              {emailError && <p className="text-xs text-red-600 mt-1">{emailError}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Sending link…" : "Send reset link"}
            </button>

            <button
              type="button"
              onClick={() => navigate("/")}
              className="w-full text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

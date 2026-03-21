import { useState } from "react";
import { Briefcase, ArrowLeft, Eye, EyeOff, CheckCircle2, ShieldAlert } from "lucide-react";
import { useLocation, useSearch } from "wouter";

function validatePassword(pw: string): string | null {
  if (!pw) return "Password is required";
  if (pw.length < 8) return "Password must be at least 8 characters";
  return null;
}

function validateConfirm(pw: string, confirm: string): string | null {
  if (!confirm) return "Please confirm your password";
  if (pw !== confirm) return "Passwords do not match";
  return null;
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const checks = [
    { label: "8+ characters", ok: password.length >= 8 },
    { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "Number", ok: /\d/.test(password) },
    { label: "Special character", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ["bg-red-400", "bg-orange-400", "bg-amber-400", "bg-emerald-400", "bg-emerald-500"];
  const labels = ["", "Weak", "Fair", "Good", "Strong"];

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= score ? colors[score] : "bg-slate-100"}`} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {checks.map(c => (
            <span key={c.label} className={`text-[11px] ${c.ok ? "text-emerald-600" : "text-slate-400"}`}>
              {c.ok ? "✓" : "·"} {c.label}
            </span>
          ))}
        </div>
        {score > 0 && <span className={`text-[11px] font-medium ${score >= 3 ? "text-emerald-600" : "text-amber-600"}`}>{labels[score]}</span>}
      </div>
    </div>
  );
}

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState("");

  if (!token) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="bg-red-50 p-3 rounded-xl">
              <ShieldAlert className="w-8 h-8 text-red-500" />
            </div>
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 text-lg">Invalid link</h2>
            <p className="text-sm text-slate-500 mt-2">This password reset link is missing a token. Please request a new one.</p>
          </div>
          <button onClick={() => navigate("/forgot-password")} className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-semibold hover:bg-primary/90 transition-colors">
            Request new link
          </button>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pErr = validatePassword(password);
    const cErr = validateConfirm(password, confirm);
    setPasswordError(pErr ?? "");
    setConfirmError(cErr ?? "");
    if (pErr || cErr) return;

    setServerError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setServerError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
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
          <p className="text-slate-500 text-sm mt-1">Choose a new password</p>
        </div>

        {done ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="bg-emerald-50 p-3 rounded-xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 text-lg">Password updated</h2>
              <p className="text-sm text-slate-500 mt-2">Your password has been changed successfully. You can now sign in with your new password.</p>
            </div>
            <button
              onClick={() => navigate("/")}
              className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            {serverError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                {serverError}
                {serverError.includes("expired") && (
                  <span> <button type="button" onClick={() => navigate("/forgot-password")} className="underline font-medium">Request a new link</button>.</span>
                )}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700" htmlFor="password">
                New password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(""); }}
                  onBlur={() => setPasswordError(validatePassword(password) ?? "")}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  className={`w-full pr-10 pl-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors ${
                    passwordError
                      ? "border-red-300 focus:ring-red-200 focus:border-red-400"
                      : "border-slate-200 focus:ring-primary/30 focus:border-primary"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordError && <p className="text-xs text-red-600">{passwordError}</p>}
              <PasswordStrength password={password} />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700" htmlFor="confirm">
                Confirm new password
              </label>
              <div className="relative">
                <input
                  id="confirm"
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); if (confirmError) setConfirmError(""); }}
                  onBlur={() => setConfirmError(validateConfirm(password, confirm) ?? "")}
                  placeholder="Repeat your new password"
                  autoComplete="new-password"
                  className={`w-full pr-10 pl-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors ${
                    confirmError
                      ? "border-red-300 focus:ring-red-200 focus:border-red-400"
                      : confirm && confirm === password
                      ? "border-emerald-300 focus:ring-emerald-200 focus:border-emerald-400"
                      : "border-slate-200 focus:ring-primary/30 focus:border-primary"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmError && <p className="text-xs text-red-600">{confirmError}</p>}
              {!confirmError && confirm && confirm === password && (
                <p className="text-xs text-emerald-600">Passwords match ✓</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Updating password…" : "Update password"}
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

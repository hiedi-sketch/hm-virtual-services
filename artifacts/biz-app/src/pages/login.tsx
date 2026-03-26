import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";

function validateEmail(email: string): string | null {
  if (!email.trim()) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address";
  return null;
}

function validatePassword(pw: string): string | null {
  if (!pw) return "Password is required";
  return null;
}

export default function Login() {
  const { login } = useAuth();
  const [, navigate] = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);

  function handleEmailBlur() {
    setEmailFocused(false);
    setEmailError(validateEmail(email) ?? "");
  }

  function handlePasswordBlur() {
    setPwFocused(false);
    setPasswordError(validatePassword(password) ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr ?? "");
    setPasswordError(pErr ?? "");
    if (eErr || pErr) return;

    setServerError("");
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setServerError(
        msg.toLowerCase().includes("expired")
          ? "Your session expired. Please sign in again."
          : msg
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center px-8"
      style={{ fontFamily: "'Inter', sans-serif", backgroundColor: "#f9f9f7" }}
    >
      <div className="w-full max-w-xs">

        {/* Logo + Wordmark */}
        <div className="mb-16 flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ background: "#266b75", fontFamily: "Georgia, serif", letterSpacing: "-0.5px" }}
          >
            HM
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight" style={{ color: "#266b75" }}>HM Virtual Services</div>
            <div className="text-xs" style={{ color: "#999" }}>Suite</div>
          </div>
        </div>

        {/* Heading */}
        <h1
          className="text-2xl font-semibold mb-1 leading-tight"
          style={{ color: "#111", letterSpacing: "-0.02em" }}
        >
          Sign in
        </h1>
        <p className="text-sm mb-12" style={{ color: "#888" }}>
          Enter your credentials to continue.
        </p>

        {/* Server error */}
        {serverError && (
          <div className="mb-6 text-sm" style={{ color: "#b91c1c" }}>
            {serverError}
          </div>
        )}

        <form className="space-y-8" onSubmit={handleSubmit} noValidate>
          {/* Email */}
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="text-xs font-semibold uppercase"
              style={{
                letterSpacing: "0.12em",
                color: emailFocused ? "#266b75" : emailError ? "#b91c1c" : "#999",
                transition: "color 0.15s",
              }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                if (emailError) setEmailError("");
                if (serverError) setServerError("");
              }}
              onFocus={() => setEmailFocused(true)}
              onBlur={handleEmailBlur}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full pb-2.5 text-sm bg-transparent outline-none border-0 border-b placeholder:text-gray-300 text-gray-900 transition-all"
              style={{
                borderBottom: `1.5px solid ${
                  emailError ? "#f87171" : emailFocused ? "#7dbdc6" : "#d4d4d0"
                }`,
              }}
            />
            {emailError && (
              <p className="text-xs" style={{ color: "#b91c1c" }}>{emailError}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label
                htmlFor="password"
                className="text-xs font-semibold uppercase"
                style={{
                  letterSpacing: "0.12em",
                  color: pwFocused ? "#266b75" : passwordError ? "#b91c1c" : "#999",
                  transition: "color 0.15s",
                }}
              >
                Password
              </label>
              <button
                type="button"
                onClick={() => navigate("/forgot-password")}
                className="text-xs font-medium uppercase transition-opacity hover:opacity-70"
                style={{ color: "#266b75", letterSpacing: "0.1em" }}
              >
                Forgot?
              </button>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError("");
                  if (serverError) setServerError("");
                }}
                onFocus={() => setPwFocused(true)}
                onBlur={handlePasswordBlur}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full pb-2.5 pr-6 text-sm bg-transparent outline-none border-0 border-b placeholder:text-gray-300 text-gray-900 transition-all"
                style={{
                  borderBottom: `1.5px solid ${
                    passwordError ? "#f87171" : pwFocused ? "#7dbdc6" : "#d4d4d0"
                  }`,
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-0 top-0 transition-colors"
                style={{ color: pwFocused ? "#7dbdc6" : "#bbb" }}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {passwordError && (
              <p className="text-xs" style={{ color: "#b91c1c" }}>{passwordError}</p>
            )}
          </div>

          {/* Submit */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 text-sm font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: "#266b75",
                borderRadius: "3px",
                letterSpacing: "0.04em",
              }}
            >
              {loading ? "Signing in…" : "Continue →"}
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className="mt-16 pt-8" style={{ borderTop: "1px solid #e8e8e4" }}>
          <p className="text-xs" style={{ color: "#bbb" }}>
            Default admin: admin@flowstate.app / admin123 · HM Virtual Services Suite
          </p>
        </div>

      </div>
    </div>
  );
}

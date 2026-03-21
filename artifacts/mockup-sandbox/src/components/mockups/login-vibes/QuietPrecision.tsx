import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function QuietPrecision() {
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center px-8"
      style={{ fontFamily: "'Inter', sans-serif", backgroundColor: "#f9f9f7" }}
    >
      <div className="w-full max-w-xs">
        {/* Wordmark — teal brand color */}
        <div className="mb-16">
          <span
            className="text-xs font-bold uppercase tracking-[0.22em]"
            style={{ color: "#266b75" }}
          >
            Flowstate
          </span>
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

        <form className="space-y-8" onSubmit={e => e.preventDefault()}>
          {/* Email — underline only */}
          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: emailFocused ? "#266b75" : "#999", transition: "color 0.15s" }}
            >
              Email
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                placeholder="you@example.com"
                className="w-full pb-2.5 text-sm bg-transparent outline-none border-0 border-b placeholder:text-gray-300 text-gray-900 transition-all"
                style={{
                  borderBottom: `1.5px solid ${emailFocused ? "#7dbdc6" : "#d4d4d0"}`,
                }}
              />
            </div>
          </div>

          {/* Password — underline only */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: pwFocused ? "#266b75" : "#999", transition: "color 0.15s" }}
              >
                Password
              </label>
              <button
                type="button"
                className="text-xs uppercase tracking-widest font-medium transition-colors"
                style={{ color: "#266b75" }}
              >
                Forgot?
              </button>
            </div>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={pw}
                onChange={e => setPw(e.target.value)}
                onFocus={() => setPwFocused(true)}
                onBlur={() => setPwFocused(false)}
                placeholder="••••••••"
                className="w-full pb-2.5 pr-6 text-sm bg-transparent outline-none border-0 border-b placeholder:text-gray-300 text-gray-900 transition-all"
                style={{
                  borderBottom: `1.5px solid ${pwFocused ? "#7dbdc6" : "#d4d4d0"}`,
                }}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-0 top-0 transition-colors"
                style={{ color: pwFocused ? "#7dbdc6" : "#bbb" }}
              >
                {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* CTA — teal, minimal radius */}
          <div className="pt-4">
            <button
              type="submit"
              className="w-full py-3 text-sm font-semibold text-white transition-opacity hover:opacity-85"
              style={{
                backgroundColor: "#266b75",
                borderRadius: "3px",
                letterSpacing: "0.04em",
              }}
            >
              Continue →
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className="mt-16 pt-8" style={{ borderTop: "1px solid #e8e8e4" }}>
          <p className="text-xs" style={{ color: "#bbb" }}>
            © 2025 Flowstate · All rights reserved
          </p>
        </div>
      </div>
    </div>
  );
}

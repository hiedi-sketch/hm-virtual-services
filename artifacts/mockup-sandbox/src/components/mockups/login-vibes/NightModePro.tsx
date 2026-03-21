import { useState } from "react";
import { Eye, EyeOff, Zap } from "lucide-react";

export function NightModePro() {
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center px-6"
      style={{ fontFamily: "'Inter', sans-serif", backgroundColor: "#0d0f1a" }}
    >
      {/* Ambient glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-96 h-64 opacity-20 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse, #22d3ee 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo mark */}
        <div className="flex items-center gap-2.5 mb-12">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #22d3ee 0%, #818cf8 100%)",
            }}
          >
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span
            className="font-bold text-base tracking-tight"
            style={{ color: "#f0f0ff" }}
          >
            Flowstate
          </span>
          <span
            className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: "#1a2235", color: "#22d3ee", border: "1px solid #22d3ee33" }}
          >
            v2.0
          </span>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-7 space-y-5"
          style={{
            backgroundColor: "#13151f",
            border: "1px solid #1e2235",
            boxShadow: "0 0 0 1px #22d3ee0d, 0 24px 40px rgba(0,0,0,0.5)",
          }}
        >
          <div className="space-y-0.5">
            <h1
              className="text-xl font-bold"
              style={{ color: "#f0f0ff", letterSpacing: "-0.02em" }}
            >
              Welcome back
            </h1>
            <p className="text-sm" style={{ color: "#4a5280" }}>
              Sign in to your workspace
            </p>
          </div>

          <form className="space-y-4" onSubmit={e => e.preventDefault()}>
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: "#4a5280" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all placeholder:opacity-30"
                style={{
                  backgroundColor: "#0d0f1a",
                  border: "1px solid #1e2235",
                  color: "#e8e8ff",
                }}
                onFocus={e => {
                  e.target.style.borderColor = "#22d3ee55";
                  e.target.style.boxShadow = "0 0 0 3px rgba(34,211,238,0.08)";
                }}
                onBlur={e => {
                  e.target.style.borderColor = "#1e2235";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium" style={{ color: "#4a5280" }}>
                  Password
                </label>
                <button type="button" className="text-xs font-medium" style={{ color: "#22d3ee" }}>
                  Forgot?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-lg text-sm outline-none transition-all placeholder:opacity-30"
                  style={{
                    backgroundColor: "#0d0f1a",
                    border: "1px solid #1e2235",
                    color: "#e8e8ff",
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = "#22d3ee55";
                    e.target.style.boxShadow = "0 0 0 3px rgba(34,211,238,0.08)";
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = "#1e2235";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "#4a5280" }}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* CTA */}
            <button
              type="submit"
              className="w-full py-2.5 rounded-lg text-sm font-bold transition-opacity hover:opacity-90 mt-1"
              style={{
                background: "linear-gradient(90deg, #22d3ee 0%, #818cf8 100%)",
                color: "#0d0f1a",
                boxShadow: "0 0 24px rgba(34,211,238,0.25)",
              }}
            >
              Sign in →
            </button>
          </form>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2 mt-5 px-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.5)]" />
          <p className="text-xs" style={{ color: "#2d3555" }}>
            All systems operational
          </p>
        </div>
      </div>
    </div>
  );
}

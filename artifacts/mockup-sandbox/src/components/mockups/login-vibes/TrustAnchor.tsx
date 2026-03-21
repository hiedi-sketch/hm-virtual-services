import { useState } from "react";
import { Eye, EyeOff, Mail, Lock, ShieldCheck } from "lucide-react";

export function TrustAnchor() {
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Inter', sans-serif", backgroundColor: "#faf7f4" }}>
      {/* Left panel — brand / trust */}
      <div
        className="hidden lg:flex lg:w-[42%] flex-col justify-between p-10 relative overflow-hidden"
        style={{ backgroundColor: "#1a2332" }}
      >
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(#e5e5e5 1px, transparent 1px), linear-gradient(90deg, #e5e5e5 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Top logo */}
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#c9882a" }}>
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold tracking-tight text-base">Flowstate</span>
        </div>

        {/* Middle copy */}
        <div className="relative z-10 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#c9882a" }}>
            Trusted by growing firms
          </p>
          <h2 className="text-3xl font-bold leading-snug" style={{ color: "#f0ece6" }}>
            Your business,<br />beautifully managed.
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "#8898aa" }}>
            Invoices, time tracking, client communication — all in one place, built for bookkeeping and VA professionals.
          </p>
        </div>

        {/* Bottom trust badge */}
        <div className="relative z-10 flex items-center gap-3 pt-4 border-t" style={{ borderColor: "#2e3d52" }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: "#c9882a", color: "#fff" }}>5★</div>
          <div>
            <p className="text-xs font-semibold" style={{ color: "#d9cfc4" }}>Rated 4.9/5 by our clients</p>
            <p className="text-xs" style={{ color: "#8898aa" }}>Boutique reliability, enterprise precision</p>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col justify-center items-center px-8 py-12" style={{ backgroundColor: "#faf7f4" }}>
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#c9882a" }}>
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold tracking-tight" style={{ color: "#1a2332" }}>Flowstate</span>
        </div>

        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#1a2332" }}>Welcome back</h1>
          <p className="text-sm mb-8" style={{ color: "#7a8899" }}>Sign in to your account to continue</p>

          <form className="space-y-4" onSubmit={e => e.preventDefault()}>
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: "#374151" }}>Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#a8906a" }} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border outline-none transition-all"
                  style={{
                    borderColor: "#ddd4c8",
                    backgroundColor: "#fff",
                    color: "#1a2332",
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium" style={{ color: "#374151" }}>Password</label>
                <button type="button" className="text-xs font-medium" style={{ color: "#c9882a" }}>
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#a8906a" }} />
                <input
                  type={showPw ? "text" : "password"}
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 text-sm rounded-lg border outline-none transition-all"
                  style={{
                    borderColor: "#ddd4c8",
                    backgroundColor: "#fff",
                    color: "#1a2332",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "#a89580" }}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* CTA */}
            <button
              type="submit"
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 mt-2"
              style={{
                background: "linear-gradient(135deg, #c9882a 0%, #a0692a 100%)",
                boxShadow: "0 2px 8px rgba(169, 104, 40, 0.35)",
              }}
            >
              Sign in
            </button>
          </form>

          <p className="text-center text-xs mt-8" style={{ color: "#b0a090" }}>
            Protected by 256-bit encryption · SOC 2 Type II
          </p>
        </div>
      </div>
    </div>
  );
}

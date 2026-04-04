import { Link } from "wouter";
import { ArrowRight, CheckCircle, Briefcase, Calculator, ClipboardList } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";

const TOOLS = [
  { name: "QuickBooks", icon: "📊" },
  { name: "Google Workspace", icon: "🔵" },
  { name: "Slack", icon: "💬" },
  { name: "Asana", icon: "🔴" },
  { name: "Shopify", icon: "🛍️" },
  { name: "And More!", icon: "✨" },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Schedule a Discovery Call",
    desc: "Send me an email, or click the button below to get started. No commitment — just a conversation.",
  },
  {
    step: "02",
    title: "We Review Your Needs & Goals",
    desc: "We'll talk through your business, your pain points, and what support would make the biggest difference.",
  },
  {
    step: "03",
    title: "Receive Ongoing Support",
    desc: "Get consistent, tailored support so you can stay focused on growing your business while I handle the rest.",
  },
];

const WHY_US = [
  "6+ years as a freelance professional",
  "Mom-owned, detail-driven, and dependable",
  "Clear communication & consistent support",
  "Small-business focused — no corporate fluff",
];

export default function PublicHome() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="relative bg-[#266b75] overflow-hidden">
        <div className="absolute inset-0 opacity-20"
          style={{ backgroundImage: "radial-gradient(ellipse at 80% 50%, #7dbdc6 0%, transparent 60%)" }}
        />
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 md:py-28 relative">
          <div className="flex flex-col md:flex-row items-center gap-12 md:gap-16">
            {/* Left: text */}
            <div className="flex-1">
              <p className="text-[#7dbdc6] text-sm font-semibold uppercase tracking-widest mb-4">
                Virtual Bookkeeping & Admin Services
              </p>
              <h1 className="text-4xl md:text-5xl lg:text-[3.25rem] font-bold text-black leading-tight mb-6">
                Taking the Stress Out of Business & Bookkeeping—So You Can Focus on What Matters Most.
              </h1>
              <p className="text-lg text-white/75 mb-8 leading-relaxed">
                Mom-owned virtual bookkeeping and administrative services helping small business owners stay organized, confident, and stress-free.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#266b75] font-bold rounded-xl hover:bg-[#f0f9fa] transition-colors shadow-lg text-sm"
                >
                  Book A Call!
                </Link>
                <Link
                  href="/bookkeeping"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 text-white font-semibold rounded-xl border border-white/25 hover:bg-white/20 transition-colors text-sm"
                >
                  Get Started NOW! <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
            {/* Right: logo */}
            <div className="shrink-0 flex items-center justify-center">
              <img
                src="/hm-logo-full.png"
                alt="HM Virtual Services"
                className="h-72 md:h-96 w-auto object-contain"
                style={{ filter: "brightness(0) invert(1)" }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Impact callout */}
      <section className="bg-stone-50 border-b border-stone-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-stone-900 mb-3">
              Big Help, Clear Books, Real Impact.
            </h2>
            <p className="text-stone-900 leading-relaxed">
              Running a small business is hard enough without worrying about messy books or unfinished admin tasks. If you're feeling behind, overwhelmed, or unsure of your numbers — you're not alone. I help small business owners stay organized, compliant, and confident in their finances.
            </p>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-stone-900 mb-2 text-center">My Services</h2>
          <p className="text-stone-700 text-center mb-10 text-sm">Everything your business needs — under one roof.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Bookkeeping */}
            <div className="border border-stone-200 rounded-2xl p-7 hover:shadow-md hover:border-[#266b75]/30 transition-all">
              <div className="w-11 h-11 bg-[#266b75]/10 rounded-xl flex items-center justify-center mb-4">
                <Calculator className="w-5 h-5 text-[#266b75]" />
              </div>
              <h3 className="text-lg font-bold text-stone-900 mb-1">Bookkeeping Services</h3>
              <p className="text-sm text-stone-700 mb-4">Clean books, confident decisions.</p>
              <ul className="space-y-2">
                {["Monthly bookkeeping", "Catch-up & clean-up", "Reconciliations", "Financial reports", "Payroll Services"].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-stone-700">
                    <CheckCircle className="w-3.5 h-3.5 text-[#266b75] shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/bookkeeping" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#266b75] hover:underline">
                Learn more <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* VA Services */}
            <div className="border border-stone-200 rounded-2xl p-7 hover:shadow-md hover:border-[#266b75]/30 transition-all">
              <div className="w-11 h-11 bg-[#266b75]/10 rounded-xl flex items-center justify-center mb-4">
                <ClipboardList className="w-5 h-5 text-[#266b75]" />
              </div>
              <h3 className="text-lg font-bold text-stone-900 mb-1">Virtual Assistant Services</h3>
              <p className="text-sm text-stone-700 mb-4">Admin support that keeps you moving.</p>
              <ul className="space-y-2">
                {["Administrative support", "Inbox & task management", "Ongoing project support", "Invoice Management", "General Customer Service"].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-stone-700">
                    <CheckCircle className="w-3.5 h-3.5 text-[#266b75] shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/administration" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#266b75] hover:underline">
                Learn more <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Why Work With HM */}
      <section className="py-16 bg-stone-50 border-y border-stone-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center max-w-4xl mx-auto">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-stone-900 mb-2">
                Why Work With HM Virtual Services?
              </h2>
              <p className="text-stone-900 text-sm mb-6">Dependable, detail-driven support built for small business owners like you.</p>
              <ul className="space-y-3">
                {WHY_US.map(item => (
                  <li key={item} className="flex items-center gap-3 text-stone-700">
                    <span className="text-[#266b75] font-bold text-lg">✔️</span>
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>
              <Link href="/about" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-white bg-[#266b75] px-5 py-2.5 rounded-xl hover:bg-[#1f5560] transition-colors shadow-sm">
                Learn My Story <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#266b75] rounded-2xl p-7 text-center text-white">
                <p className="text-4xl font-bold mb-1">6+</p>
                <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Years Experience</p>
              </div>
              <div className="bg-white border border-stone-200 rounded-2xl p-7 text-center shadow-sm">
                <p className="text-4xl font-bold text-[#266b75] mb-1">50+</p>
                <p className="text-stone-700 text-xs font-medium uppercase tracking-wide">Clients Served</p>
              </div>
              <div className="bg-white border border-stone-200 rounded-2xl p-7 text-center shadow-sm">
                <p className="text-4xl font-bold text-[#266b75] mb-1">100%</p>
                <p className="text-stone-700 text-xs font-medium uppercase tracking-wide">Mom-Owned & Operated</p>
              </div>
              <div className="bg-[#7dbdc6]/20 border border-[#7dbdc6]/30 rounded-2xl p-7 text-center">
                <p className="text-4xl font-bold text-[#266b75] mb-1">24h</p>
                <p className="text-stone-900 text-xs font-medium uppercase tracking-wide">Response Time</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-stone-900 text-center mb-2">How It Works</h2>
          <p className="text-stone-700 text-center text-sm mb-10">Getting started is simple.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {HOW_IT_WORKS.map(({ step, title, desc }) => (
              <div key={step} className="text-center px-4">
                <div className="w-12 h-12 bg-[#266b75] rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold text-sm">
                  {step}
                </div>
                <h3 className="font-semibold text-stone-900 mb-2 text-sm">{title}</h3>
                <p className="text-xs text-stone-700 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#266b75] text-white font-semibold rounded-xl hover:bg-[#1f5560] transition-colors shadow-sm text-sm">
              Book A Call!
            </Link>
            <Link href="/contact" className="inline-flex items-center gap-2 px-5 py-2.5 border border-[#266b75] text-[#266b75] font-semibold rounded-xl hover:bg-[#266b75]/5 transition-colors text-sm">
              Contact Me!
            </Link>
          </div>
        </div>
      </section>

      {/* Tools */}
      <section className="py-12 bg-stone-50 border-t border-stone-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <h2 className="text-lg font-bold text-stone-700 text-center mb-6 uppercase tracking-widest text-xs">Tools I Work With</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {TOOLS.map(({ name, icon }) => (
              <div key={name} className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm">
                <span>{icon}</span>
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-[#266b75]">
        <div className="max-w-2xl mx-auto px-5 sm:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Ready for reliable bookkeeping support you can count on?
          </h2>
          <p className="text-white/70 mb-7 text-sm">Let's talk. No pressure — just a friendly conversation about your business.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/contact" className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#266b75] font-bold rounded-xl hover:bg-[#f0f9fa] transition-colors shadow-lg text-sm">
              Book A Call!
            </Link>
            <Link href="/contact" className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 text-white font-semibold rounded-xl border border-white/25 hover:bg-white/20 transition-colors text-sm">
              Contact Me! <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

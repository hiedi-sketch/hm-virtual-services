import { Link } from "wouter";
import { ArrowRight, Heart, Shield, Zap, TrendingUp } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";

const VALUES = [
  {
    icon: Heart,
    title: "People First",
    desc: "We treat every client's business like it's our own. Your success is our success — full stop.",
  },
  {
    icon: Shield,
    title: "Trust & Discretion",
    desc: "Total confidentiality, every time. Your business details stay private and secure.",
  },
  {
    icon: Zap,
    title: "Speed & Reliability",
    desc: "We respond fast and deliver consistently. No surprises, no excuses — just results.",
  },
  {
    icon: TrendingUp,
    title: "Always Growing",
    desc: "We invest in the latest tools and skills to serve you at the highest level, continuously.",
  },
];

const PROCESS = [
  {
    step: "01",
    title: "Free Consultation",
    desc: "We start with a no-pressure call to understand your business, your challenges, and your goals.",
  },
  {
    step: "02",
    title: "Custom Proposal",
    desc: "We put together a tailored scope of work and package that fits your needs and budget.",
  },
  {
    step: "03",
    title: "Seamless Onboarding",
    desc: "You get access to your client portal, we get the tools and context we need — and we get to work.",
  },
  {
    step: "04",
    title: "Ongoing Partnership",
    desc: "Regular check-ins, clear reporting, and continuous improvement. We grow alongside your business.",
  },
];

export default function PublicAbout() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-100 py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-block mb-4 px-3 py-1 rounded-full text-xs font-semibold bg-[#266b75]/10 text-[#266b75] tracking-wider uppercase">
                About Us
              </span>
              <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-5 leading-tight">
                We're the Partner Your Business Has Been Missing
              </h1>
              <p className="text-lg text-slate-500 leading-relaxed mb-6">
                HM Virtual Services was founded on a simple belief: small business owners shouldn't have to do everything alone.
              </p>
              <p className="text-slate-600 leading-relaxed">
                We built this company to give entrepreneurs and growing businesses access to the kind of dedicated, expert support that was once only available to large corporations — at a price point that actually makes sense.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#266b75] rounded-2xl p-8 text-white col-span-2">
                <p className="text-4xl font-bold mb-2">Built for Business Owners, By Business Owners</p>
              </div>
              <div className="bg-slate-100 rounded-2xl p-6">
                <p className="text-3xl font-bold text-[#266b75] mb-1">5+</p>
                <p className="text-sm text-slate-500">Years in business</p>
              </div>
              <div className="bg-[#7dbdc6]/20 rounded-2xl p-6">
                <p className="text-3xl font-bold text-[#266b75] mb-1">50+</p>
                <p className="text-sm text-slate-500">Clients served</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">Our Mission</h2>
            <p className="text-lg text-slate-600 leading-relaxed mb-4">
              To help entrepreneurs reclaim their time by providing reliable, professional, and high-quality virtual support services — so they can focus on the work that lights them up and drives real results.
            </p>
            <p className="text-slate-500 leading-relaxed">
              We're not a task-processing service. We're a true operational partner that takes ownership, communicates proactively, and delivers with care every single day.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">What We Stand For</h2>
            <p className="text-slate-500">The principles that guide every interaction and every deliverable.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {VALUES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm text-center">
                <div className="w-12 h-12 bg-[#266b75]/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-5 h-5 text-[#266b75]" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How we work */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">How It Works</h2>
            <p className="text-slate-500">From first conversation to ongoing partnership in four simple steps.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PROCESS.map(({ step, title, desc }) => (
              <div key={step} className="relative">
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 h-full">
                  <span className="text-4xl font-black text-[#266b75]/15 leading-none block mb-3">{step}</span>
                  <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-[#266b75]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Let's Work Together
          </h2>
          <p className="text-white/80 mb-8">
            Ready to experience what it feels like to have real support in your business? We'd love to meet you.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#266b75] font-semibold rounded-xl hover:bg-[#f0f9fa] transition-colors shadow-lg"
          >
            Get in Touch <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}

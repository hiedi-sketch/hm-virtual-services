import { Link } from "wouter";
import { ArrowRight, CheckCircle, Clock, FileText, Users, MessageSquare, Star } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";

const SERVICES = [
  {
    icon: FileText,
    title: "Administrative Support",
    desc: "Email management, calendar scheduling, data entry, document preparation, and day-to-day admin tasks handled with precision.",
  },
  {
    icon: Users,
    title: "Client Relations",
    desc: "Professional client communication, follow-ups, onboarding coordination, and CRM management to keep your clients happy.",
  },
  {
    icon: Clock,
    title: "Project Coordination",
    desc: "Task tracking, deadline management, and workflow organization so your projects stay on time and on budget.",
  },
  {
    icon: MessageSquare,
    title: "Social Media & Content",
    desc: "Scheduling posts, drafting copy, managing your content calendar, and engaging with your audience consistently.",
  },
];

const TESTIMONIALS = [
  {
    name: "Sarah M.",
    role: "E-commerce Founder",
    quote: "HM Virtual Services transformed my business. I went from drowning in admin to focusing 100% on growth. Absolutely invaluable.",
    rating: 5,
  },
  {
    name: "James T.",
    role: "Real Estate Agent",
    quote: "Professional, reliable, and proactive. My inbox is finally under control and my clients notice the difference.",
    rating: 5,
  },
  {
    name: "Priya K.",
    role: "Marketing Consultant",
    quote: "The best investment I've made for my business. Quick turnaround, high quality, and always one step ahead.",
    rating: 5,
  },
];

const WHY_US = [
  "Dedicated support tailored to your business",
  "Flexible packages — hourly or retainer",
  "Fast response times, no offshore delays",
  "Confidential and professional always",
  "Fully integrated with your existing tools",
  "Regular progress updates and reporting",
];

export default function PublicHome() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-[#266b75] via-[#1f5560] to-[#163e47] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_#7dbdc6_0%,_transparent_60%)]" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32 relative">
          <div className="max-w-2xl">
            <span className="inline-block mb-4 px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white/90 border border-white/25 tracking-wider uppercase">
              Virtual Assistant Services
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              Run Your Business.<br />
              <span className="text-[#7dbdc6]">We'll Handle the Rest.</span>
            </h1>
            <p className="text-lg md:text-xl text-white/80 mb-8 leading-relaxed">
              Professional virtual assistant services for entrepreneurs and small businesses. From admin to client relations — we free your time so you can focus on what you do best.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/contact"
                className="flex items-center gap-2 px-6 py-3 bg-white text-[#266b75] font-semibold rounded-xl hover:bg-[#f0f9fa] transition-colors shadow-lg"
              >
                Get Started Today
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/services"
                className="flex items-center gap-2 px-6 py-3 bg-white/10 text-white font-semibold rounded-xl border border-white/25 hover:bg-white/20 transition-colors"
              >
                View Services
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Services overview */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">What We Do</h2>
            <p className="text-lg text-slate-500 max-w-xl mx-auto">
              Comprehensive virtual support across every area of your business operations.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {SERVICES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md hover:border-[#7dbdc6]/30 transition-all group">
                <div className="w-12 h-12 bg-[#266b75]/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#266b75]/15 transition-colors">
                  <Icon className="w-5 h-5 text-[#266b75]" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              href="/services"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#266b75] hover:text-[#1f5560] transition-colors"
            >
              See all services <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* About / credibility */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-[#266b75] text-sm font-semibold uppercase tracking-wider">Why HM Virtual Services</span>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mt-2 mb-6">
                Your Business Deserves Expert Support
              </h2>
              <p className="text-slate-600 leading-relaxed mb-6">
                We're not a call center or an offshore agency. HM Virtual Services is a boutique virtual assistant firm dedicated to building real, lasting partnerships with our clients.
              </p>
              <p className="text-slate-600 leading-relaxed mb-8">
                Every client gets a dedicated point of contact, clear communication, and consistent quality — so you always know exactly where things stand.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {WHY_US.map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle className="w-4 h-4 text-[#266b75] shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#266b75] text-white rounded-2xl p-8 flex flex-col justify-center">
                <p className="text-5xl font-bold mb-2">5+</p>
                <p className="text-white/80 text-sm font-medium">Years of Experience</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-8 flex flex-col justify-center">
                <p className="text-5xl font-bold text-[#266b75] mb-2">50+</p>
                <p className="text-slate-500 text-sm font-medium">Happy Clients Served</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-8 flex flex-col justify-center">
                <p className="text-5xl font-bold text-[#266b75] mb-2">100%</p>
                <p className="text-slate-500 text-sm font-medium">Client Satisfaction</p>
              </div>
              <div className="bg-[#7dbdc6] text-white rounded-2xl p-8 flex flex-col justify-center">
                <p className="text-5xl font-bold mb-2">24h</p>
                <p className="text-white/80 text-sm font-medium">Response Guarantee</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">What Clients Say</h2>
            <p className="text-slate-500">Real results from real business owners.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(({ name, role, quote, rating }) => (
              <div key={name} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: rating }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-slate-700 leading-relaxed mb-5 italic">"{quote}"</p>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{name}</p>
                  <p className="text-xs text-slate-400">{role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#266b75]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Get Your Time Back?
          </h2>
          <p className="text-white/80 text-lg mb-8">
            Let's talk about how HM Virtual Services can support your business. No commitment — just a conversation.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-[#266b75] font-bold rounded-xl hover:bg-[#f0f9fa] transition-colors shadow-xl text-lg"
          >
            Schedule a Free Consultation
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}

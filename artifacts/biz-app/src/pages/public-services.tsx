import { Link } from "wouter";
import { ArrowRight, Check, FileText, Users, Clock, MessageSquare, BookOpen, BarChart2 } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";

const SERVICES = [
  {
    icon: FileText,
    title: "Administrative Support",
    color: "bg-blue-50 text-blue-600",
    features: [
      "Email inbox management & filtering",
      "Calendar scheduling & appointment setting",
      "Data entry & spreadsheet management",
      "Document creation & formatting",
      "Travel & logistics coordination",
      "General admin tasks & research",
    ],
    desc: "Take back hours of your week. We handle the admin load so you can show up fully for the work only you can do.",
  },
  {
    icon: Users,
    title: "Client Relations",
    color: "bg-[#266b75]/10 text-[#266b75]",
    features: [
      "Client onboarding coordination",
      "Follow-up emails & touchpoints",
      "CRM data entry & maintenance",
      "Meeting prep & follow-up notes",
      "Proposal & contract support",
      "Client satisfaction check-ins",
    ],
    desc: "Your clients deserve white-glove treatment. We ensure every interaction is timely, professional, and on-brand.",
  },
  {
    icon: Clock,
    title: "Project Coordination",
    color: "bg-amber-50 text-amber-600",
    features: [
      "Task & deadline tracking",
      "Project status updates",
      "Team communication coordination",
      "Workflow documentation",
      "Meeting facilitation & minutes",
      "Progress reporting",
    ],
    desc: "Keep every project moving. We track the details, flag risks early, and keep your team aligned on what matters.",
  },
  {
    icon: MessageSquare,
    title: "Social Media & Content",
    color: "bg-purple-50 text-purple-600",
    features: [
      "Content calendar management",
      "Social media scheduling",
      "Caption drafting & editing",
      "Hashtag research",
      "Comment monitoring & replies",
      "Basic graphic coordination",
    ],
    desc: "Stay consistent online without spending your evenings on it. We keep your digital presence active and professional.",
  },
  {
    icon: BookOpen,
    title: "Research & Strategy Support",
    color: "bg-emerald-50 text-emerald-600",
    features: [
      "Market research & competitor analysis",
      "Vendor & supplier research",
      "Process documentation",
      "SOP creation",
      "Industry report summaries",
      "Resource & tool recommendations",
    ],
    desc: "Make better decisions faster. We dig into the data and deliver clear, actionable summaries ready for your review.",
  },
  {
    icon: BarChart2,
    title: "Reporting & Analytics",
    color: "bg-rose-50 text-rose-600",
    features: [
      "Monthly business summaries",
      "KPI dashboards",
      "Time & activity reporting",
      "Invoice & revenue tracking support",
      "Lead pipeline summaries",
      "Custom report creation",
    ],
    desc: "Know exactly how your business is performing. We compile the numbers and present them in a format you can actually use.",
  },
];

const PACKAGES = [
  {
    name: "Starter",
    hours: "10 hrs/month",
    price: "Starting at $350",
    features: ["Email & calendar management", "Basic admin tasks", "Weekly check-in", "Email support"],
    highlight: false,
  },
  {
    name: "Growth",
    hours: "20 hrs/month",
    price: "Starting at $650",
    features: ["Everything in Starter", "Client communication support", "Project coordination", "Priority response", "Monthly report"],
    highlight: true,
  },
  {
    name: "Partner",
    hours: "40+ hrs/month",
    price: "Custom Pricing",
    features: ["Everything in Growth", "Dedicated VA", "Full-service support", "Social media management", "Weekly strategy call"],
    highlight: false,
  },
];

export default function PublicServices() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-100 py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block mb-4 px-3 py-1 rounded-full text-xs font-semibold bg-[#266b75]/10 text-[#266b75] tracking-wider uppercase">
            Our Services
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Everything Your Business Needs
          </h1>
          <p className="text-lg text-stone-900 max-w-xl mx-auto">
            Flexible, professional virtual support services designed to scale with your business — from admin to strategy.
          </p>
        </div>
      </section>

      {/* Services grid */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {SERVICES.map(({ icon: Icon, title, color, features, desc }) => (
              <div key={title} className="border border-slate-100 rounded-2xl p-6 hover:shadow-md hover:border-[#7dbdc6]/40 transition-all flex flex-col">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-stone-900 mb-5 leading-relaxed">{desc}</p>
                <ul className="space-y-2 mt-auto">
                  {features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-stone-900">
                      <Check className="w-3.5 h-3.5 text-[#266b75] shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Packages */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Simple, Flexible Pricing</h2>
            <p className="text-stone-900">Choose the package that fits where you are right now. Scale up anytime.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {PACKAGES.map(({ name, hours, price, features, highlight }) => (
              <div
                key={name}
                className={`rounded-2xl p-7 flex flex-col ${
                  highlight
                    ? "bg-[#266b75] text-white shadow-xl ring-2 ring-[#266b75]"
                    : "bg-white border border-slate-200 text-slate-900"
                }`}
              >
                {highlight && (
                  <span className="inline-block mb-3 px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white w-fit">
                    Most Popular
                  </span>
                )}
                <h3 className={`text-xl font-bold mb-1 ${highlight ? "text-white" : "text-slate-900"}`}>{name}</h3>
                <p className={`text-sm mb-1 ${highlight ? "text-white/70" : "text-stone-700"}`}>{hours}</p>
                <p className={`text-2xl font-bold mb-6 ${highlight ? "text-white" : "text-[#266b75]"}`}>{price}</p>
                <ul className="space-y-2.5 flex-1">
                  {features.map(f => (
                    <li key={f} className={`flex items-start gap-2 text-sm ${highlight ? "text-white/90" : "text-stone-900"}`}>
                      <Check className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${highlight ? "text-[#7dbdc6]" : "text-[#266b75]"}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/contact"
                  className={`mt-6 block text-center text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors ${
                    highlight
                      ? "bg-white text-[#266b75] hover:bg-[#f0f9fa]"
                      : "bg-[#266b75] text-white hover:bg-[#1f5560]"
                  }`}
                >
                  Get Started
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-stone-700 mt-8">
            Need something custom? <Link href="/contact" className="text-[#266b75] hover:underline font-medium">Let's talk.</Link>
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-white border-t border-slate-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
            Not sure which package is right for you?
          </h2>
          <p className="text-stone-900 mb-8">
            Book a free 15-minute call and we'll help you figure out exactly what support your business needs.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#266b75] text-white font-semibold rounded-xl hover:bg-[#1f5560] transition-colors shadow-lg"
          >
            Book a Free Consultation <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}

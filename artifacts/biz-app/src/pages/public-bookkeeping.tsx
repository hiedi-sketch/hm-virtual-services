import { Link } from "wouter";
import { ArrowRight, CheckCircle, Calculator, FileText, RefreshCw, TrendingUp, DollarSign } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";

const SERVICES = [
  {
    icon: Calculator,
    title: "Monthly Bookkeeping",
    desc: "Accurate, up-to-date books every month so you always know where you stand financially. No more scrambling at tax time.",
    items: ["Categorize income & expenses", "Bank & credit card imports", "Monthly close process", "Organized digital records"],
  },
  {
    icon: RefreshCw,
    title: "Catch-Up & Clean-Up",
    desc: "Fallen behind on your books? I'll get everything reconciled, organized, and up to date — no judgment.",
    items: ["Months or years of backlog", "Reclassify & correct errors", "Get you audit-ready", "Clear starting point going forward"],
  },
  {
    icon: FileText,
    title: "Reconciliations",
    desc: "Make sure every transaction is accounted for and your books match your bank — every single time.",
    items: ["Bank account reconciliation", "Credit card reconciliation", "Merchant account matching", "Identify discrepancies fast"],
  },
  {
    icon: TrendingUp,
    title: "Financial Reports",
    desc: "Easy-to-understand reports that show you exactly how your business is doing — in plain English.",
    items: ["Profit & Loss statement", "Balance sheet", "Cash flow overview", "Custom report prep"],
  },
  {
    icon: DollarSign,
    title: "Payroll Services",
    desc: "Pay your team correctly and on time, every time. I'll handle the details so you never miss a beat.",
    items: ["Payroll processing", "Direct deposit coordination", "Payroll tax filings", "Employee records"],
  },
];

export default function PublicBookkeeping() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="bg-gradient-to-br from-[#266b75] to-[#1a4a52] py-16 md:py-20 text-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-[#7dbdc6] text-xs font-semibold uppercase tracking-widest mb-3">Bookkeeping Services</p>
            <h1 className="text-4xl md:text-5xl font-bold mb-5 leading-tight">
              Clear Books. Confident Business.
            </h1>
            <p className="text-white/75 text-lg leading-relaxed mb-8">
              I take the stress of bookkeeping off your plate so you can run your business without worrying about messy numbers or missed filings.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#266b75] font-bold rounded-xl hover:bg-[#f0f9fa] transition-colors shadow-lg text-sm"
            >
              Book A Call! <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-stone-900 text-center mb-2">What's Included</h2>
          <p className="text-stone-400 text-center text-sm mb-10">Comprehensive bookkeeping support for small business owners.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {SERVICES.map(({ icon: Icon, title, desc, items }) => (
              <div key={title} className="border border-stone-200 rounded-2xl p-6 hover:shadow-md hover:border-[#266b75]/30 transition-all">
                <div className="w-11 h-11 bg-[#266b75]/10 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-[#266b75]" />
                </div>
                <h3 className="font-bold text-stone-900 mb-2">{title}</h3>
                <p className="text-sm text-stone-500 mb-4 leading-relaxed">{desc}</p>
                <ul className="space-y-1.5">
                  {items.map(item => (
                    <li key={item} className="flex items-center gap-2 text-xs text-stone-600">
                      <CheckCircle className="w-3 h-3 text-[#266b75] shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who this is for */}
      <section className="py-14 bg-stone-50 border-y border-stone-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center">
          <h2 className="text-2xl font-bold text-stone-900 mb-4">Who This Is For</h2>
          <p className="text-stone-500 leading-relaxed mb-6 text-sm">
            I work with solopreneurs, freelancers, and small business owners who are too busy to keep up with their books — or who've tried to do it themselves and know it's time to hand it off.
          </p>
          <p className="text-stone-500 leading-relaxed text-sm">
            Whether you're just getting started or you've been in business for years with a backlog to tackle, I'm here to help.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="px-5 py-2.5 bg-[#266b75] text-white font-semibold rounded-xl hover:bg-[#1f5560] transition-colors text-sm shadow-sm">
              Book A Call!
            </Link>
            <Link href="/contact" className="px-5 py-2.5 border border-[#266b75] text-[#266b75] font-semibold rounded-xl hover:bg-[#266b75]/5 transition-colors text-sm">
              Get Started NOW!
            </Link>
          </div>
        </div>
      </section>

      {/* QuickBooks callout */}
      <section className="py-12 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center">
          <p className="text-xs uppercase tracking-widest text-stone-400 font-semibold mb-3">Shopify Partner · QuickBooks Certified</p>
          <h2 className="text-xl font-bold text-stone-900 mb-3">The tools you're already using — done right.</h2>
          <p className="text-sm text-stone-500">
            I work in QuickBooks Online, and I'm a certified Shopify Partner — so if you're running e-commerce alongside your bookkeeping, I've got you covered end to end.
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}

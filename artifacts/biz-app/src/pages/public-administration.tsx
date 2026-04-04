import { Link } from "wouter";
import { ArrowRight, CheckCircle, Inbox, ClipboardList, ShoppingBag, FileText, HeadphonesIcon } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";

const SERVICES = [
  {
    icon: Inbox,
    title: "Inbox & Task Management",
    desc: "Your email and task lists handled with care — so you wake up to a clear inbox and a clean to-do list.",
    items: ["Email triage & responses", "Flag priority items", "Task list organization", "Follow-up reminders"],
  },
  {
    icon: ClipboardList,
    title: "Administrative Support",
    desc: "Day-to-day admin tasks handled efficiently so you can stay focused on the work that actually moves your business forward.",
    items: ["Calendar management", "Document prep & formatting", "Data entry", "Research tasks"],
  },
  {
    icon: FileText,
    title: "Invoice Management",
    desc: "Stay on top of your billing without the stress. I'll make sure invoices go out on time and payments are tracked.",
    items: ["Create & send invoices", "Track outstanding payments", "Follow up on overdue accounts", "Maintain billing records"],
  },
  {
    icon: ClipboardList,
    title: "Ongoing Project Support",
    desc: "I keep your projects moving and your team informed — so deadlines are met and nothing slips through the cracks.",
    items: ["Project tracking (Asana, Trello)", "Status updates & check-ins", "Meeting notes & summaries", "Process documentation"],
  },
  {
    icon: ShoppingBag,
    title: "Shopify Partner Support",
    desc: "As a certified Shopify Partner, I can help manage your store so your e-commerce business runs smoothly.",
    items: ["Product listing management", "Order tracking support", "Customer inquiry handling", "Store admin tasks"],
  },
  {
    icon: HeadphonesIcon,
    title: "General Customer Service",
    desc: "Professional, friendly customer communication that represents your brand the way it deserves to be represented.",
    items: ["Respond to customer inquiries", "Handle complaints & resolutions", "Maintain customer satisfaction", "Coordinate with your team"],
  },
];

export default function PublicAdministration() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="bg-gradient-to-br from-[#266b75] to-[#1a4a52] py-16 md:py-20 text-white overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
            {/* Left: text */}
            <div className="flex-1">
              <p className="text-[#7dbdc6] text-xs font-semibold uppercase tracking-widest mb-3">Administration Services</p>
              <h1 className="text-4xl md:text-5xl font-bold mb-5 leading-tight">
                Admin Off Your Plate. More Time for What Matters.
              </h1>
              <p className="text-white/75 text-lg leading-relaxed mb-8">
                Virtual assistant services that handle your day-to-day operations — so you can show up fully for the work only you can do.
              </p>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#266b75] font-bold rounded-xl hover:bg-[#f0f9fa] transition-colors shadow-lg text-sm"
              >
                Book A Call! <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            {/* Right: photo */}
            <div className="shrink-0 w-full md:w-[420px]">
              <img
                src="/administration-hero.jpg"
                alt="Modern workspace with computer"
                className="w-full h-64 md:h-80 object-cover rounded-2xl shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Services grid */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-stone-900 text-center mb-2">What I Handle For You</h2>
          <p className="text-stone-400 text-center text-sm mb-10">Reliable virtual assistant support across every area of your business.</p>

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

      {/* CTA */}
      <section className="py-14 bg-stone-50 border-t border-stone-100">
        <div className="max-w-2xl mx-auto px-5 sm:px-8 text-center">
          <h2 className="text-2xl font-bold text-stone-900 mb-3">
            Ready to hand off the tasks that are slowing you down?
          </h2>
          <p className="text-stone-500 text-sm mb-7 leading-relaxed">
            Let's talk about what's on your plate and figure out the best way to support your business.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/contact" className="px-5 py-2.5 bg-[#266b75] text-white font-semibold rounded-xl hover:bg-[#1f5560] transition-colors text-sm shadow-sm">
              Book A Call!
            </Link>
            <Link href="/contact" className="px-5 py-2.5 border border-[#266b75] text-[#266b75] font-semibold rounded-xl hover:bg-[#266b75]/5 transition-colors text-sm">
              Get Started NOW!
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

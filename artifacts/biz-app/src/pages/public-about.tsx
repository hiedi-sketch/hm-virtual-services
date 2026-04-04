import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";

const TOOLS = [
  { name: "QuickBooks", icon: "📊" },
  { name: "Google Workspace", icon: "🔵" },
  { name: "Slack", icon: "💬" },
  { name: "Asana", icon: "🔴" },
  { name: "Shopify", icon: "🛍️" },
];

export default function PublicAbout() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="bg-gradient-to-br from-[#266b75] to-[#1a4a52] py-16 md:py-20 text-white overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
            {/* Left: text */}
            <div className="flex-1">
              <p className="text-[#7dbdc6] text-xs font-semibold uppercase tracking-widest mb-3">About</p>
              <h1 className="text-4xl md:text-5xl font-bold mb-5 leading-tight">
                Hi, I'm Hiedi.
              </h1>
              <p className="text-white/75 text-lg leading-relaxed">
                I'm a mom-owned, detail-driven virtual assistant and bookkeeper helping small business owners stay organized, confident, and stress-free.
              </p>
            </div>
            {/* Right: photo */}
            <div className="shrink-0 flex items-center justify-center">
              <img
                src="/hiedi-photo.png"
                alt="Hiedi — HM Virtual Services"
                className="h-64 md:h-80 w-auto object-contain drop-shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-8">
          <h2 className="text-2xl font-bold text-stone-900 mb-5">My Story</h2>
          <div className="space-y-4 text-stone-600 leading-relaxed text-sm">
            <p>
              Running a small business is hard enough without worrying about messy books or a pile of admin tasks you never get to. I started HM Virtual Services because I've seen firsthand how much time and energy entrepreneurs lose to the behind-the-scenes work — and I knew I could help.
            </p>
            <p>
              With 6+ years of experience as a freelance professional, I've worked with small business owners across a variety of industries to take the operational burden off their shoulders. Whether it's keeping the books clean, managing the inbox, or handling the details of day-to-day admin — I'm the person in the background making sure everything runs smoothly.
            </p>
            <p>
              Based in Reasnor, Iowa, I bring a small-town work ethic to everything I do: show up, do the work, and actually care about the outcome. My clients aren't just businesses — they're people trying to build something meaningful, and I take that seriously.
            </p>
          </div>
        </div>
      </section>

      {/* Why Work With Me */}
      <section className="py-14 bg-stone-50 border-y border-stone-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-8">
          <h2 className="text-2xl font-bold text-stone-900 mb-6 text-center">Why Work With HM Virtual Services?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: "✔️", text: "6+ years as a freelance professional" },
              { icon: "✔️", text: "Mom-owned, detail-driven, and dependable" },
              { icon: "✔️", text: "Clear communication & consistent support" },
              { icon: "✔️", text: "Small-business focused — no corporate fluff" },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-start gap-3 bg-white border border-stone-200 rounded-xl px-5 py-4 shadow-sm">
                <span className="text-lg mt-0.5">{icon}</span>
                <span className="text-sm text-stone-700 font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-14 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-8">
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-4xl font-bold text-[#266b75] mb-1">6+</p>
              <p className="text-xs text-stone-400 uppercase tracking-wider font-medium">Years Experience</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-[#266b75] mb-1">50+</p>
              <p className="text-xs text-stone-400 uppercase tracking-wider font-medium">Clients Served</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-[#266b75] mb-1">100%</p>
              <p className="text-xs text-stone-400 uppercase tracking-wider font-medium">Mom-Owned & Operated</p>
            </div>
          </div>
        </div>
      </section>

      {/* Tools */}
      <section className="py-12 bg-stone-50 border-t border-stone-100">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center">
          <p className="text-xs uppercase tracking-widest text-stone-400 font-semibold mb-5">Tools</p>
          <div className="flex flex-wrap justify-center gap-3 mb-3">
            {TOOLS.map(({ name, icon }) => (
              <div key={name} className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm">
                <span>{icon}</span>
                {name}
              </div>
            ))}
            <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm font-medium text-stone-500 shadow-sm">
              ✨ And Much More!
            </div>
          </div>
          <p className="text-xs text-stone-400">Also a certified Shopify Partner</p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 bg-[#266b75]">
        <div className="max-w-2xl mx-auto px-5 sm:px-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Ready to work together?
          </h2>
          <p className="text-white/70 text-sm mb-7">Let's schedule a quick call and talk about your business.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-[#266b75] font-bold rounded-xl hover:bg-[#f0f9fa] transition-colors shadow-lg text-sm">
              Book A Call!
            </Link>
            <Link href="/contact" className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 text-white font-semibold rounded-xl border border-white/25 hover:bg-white/20 transition-colors text-sm">
              Contact Me! <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

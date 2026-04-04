import { useState } from "react";
import { Mail, Phone, MapPin, CheckCircle, Loader2 } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";

interface FormState {
  name: string;
  email: string;
  business_name: string;
  phone: string;
  message: string;
}

const INITIAL: FormState = { name: "", email: "", business_name: "", phone: "", message: "" };

export default function PublicContact() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setSubmitted(true);
      setForm(INITIAL);
    } catch (e: any) {
      setError(e.message ?? "Failed to send message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      {/* Header */}
      <section className="bg-gradient-to-br from-[#266b75] to-[#1a4a52] py-16 md:py-20 text-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="max-w-xl">
            <p className="text-[#7dbdc6] text-xs font-semibold uppercase tracking-widest mb-3">Contact</p>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
              Let's Talk.
            </h1>
            <p className="text-white/75 text-lg">
              Schedule a discovery call, send me an email, or fill out the form below — I'd love to hear from you.
            </p>
          </div>
        </div>
      </section>

      {/* Contact section */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-start">
            {/* Info sidebar */}
            <div className="lg:col-span-2 space-y-8">
              <div>
                <h2 className="text-lg font-bold text-stone-900 mb-3">Get In Touch</h2>
                <p className="text-sm text-stone-500 leading-relaxed">
                  Whether you're ready to get started or just have questions — reach out. I respond to all inquiries within one business day.
                </p>
              </div>

              <div className="space-y-4">
                <a href="mailto:Hiedi@HMVirtualServices.com" className="flex items-start gap-3 group">
                  <div className="w-9 h-9 bg-[#266b75]/10 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-[#266b75]/15 transition-colors">
                    <Mail className="w-4 h-4 text-[#266b75]" />
                  </div>
                  <div>
                    <p className="text-xs text-stone-400 font-semibold uppercase tracking-wider mb-0.5">Email</p>
                    <p className="text-sm text-stone-700 font-medium group-hover:text-[#266b75] transition-colors">Hiedi@HMVirtualServices.com</p>
                  </div>
                </a>
                <a href="tel:6416316218" className="flex items-start gap-3 group">
                  <div className="w-9 h-9 bg-[#266b75]/10 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-[#266b75]/15 transition-colors">
                    <Phone className="w-4 h-4 text-[#266b75]" />
                  </div>
                  <div>
                    <p className="text-xs text-stone-400 font-semibold uppercase tracking-wider mb-0.5">Phone</p>
                    <p className="text-sm text-stone-700 font-medium group-hover:text-[#266b75] transition-colors">(641) 631-6218</p>
                  </div>
                </a>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-[#266b75]/10 rounded-lg flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-[#266b75]" />
                  </div>
                  <div>
                    <p className="text-xs text-stone-400 font-semibold uppercase tracking-wider mb-0.5">Location</p>
                    <p className="text-sm text-stone-700 font-medium">Reasnor, IA</p>
                  </div>
                </div>
              </div>

              <div className="bg-[#266b75]/5 border border-[#266b75]/15 rounded-xl p-5">
                <p className="text-sm text-[#266b75] font-semibold mb-1">Already a client?</p>
                <p className="text-sm text-stone-500">
                  Log in to your{" "}
                  <a href="/portal" className="text-[#266b75] hover:underline font-medium">client portal</a>{" "}
                  to message me directly.
                </p>
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-3">
              {submitted ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-10 text-center">
                  <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-stone-900 mb-2">Message Sent!</h3>
                  <p className="text-stone-500 text-sm">
                    Thanks for reaching out, I'll be in touch within one business day.
                  </p>
                  <button
                    onClick={() => setSubmitted(false)}
                    className="mt-5 text-sm text-[#266b75] hover:underline font-medium"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
                        Your Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={set("name")}
                        placeholder="Jane Smith"
                        className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-900 placeholder-stone-300 focus:outline-none focus:border-[#266b75] focus:ring-2 focus:ring-[#266b75]/10 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
                        Email <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={set("email")}
                        placeholder="jane@example.com"
                        className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-900 placeholder-stone-300 focus:outline-none focus:border-[#266b75] focus:ring-2 focus:ring-[#266b75]/10 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
                        Business Name
                      </label>
                      <input
                        type="text"
                        value={form.business_name}
                        onChange={set("business_name")}
                        placeholder="Acme Co. (optional)"
                        className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-900 placeholder-stone-300 focus:outline-none focus:border-[#266b75] focus:ring-2 focus:ring-[#266b75]/10 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={set("phone")}
                        placeholder="(555) 000-0000"
                        className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-900 placeholder-stone-300 focus:outline-none focus:border-[#266b75] focus:ring-2 focus:ring-[#266b75]/10 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
                      How Can I Help? <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      required
                      rows={5}
                      value={form.message}
                      onChange={set("message")}
                      placeholder="Tell me about your business and what you need help with…"
                      className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-900 placeholder-stone-300 focus:outline-none focus:border-[#266b75] focus:ring-2 focus:ring-[#266b75]/10 transition-colors resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#266b75] text-white font-bold rounded-xl hover:bg-[#1f5560] transition-colors disabled:opacity-60 shadow-sm text-sm"
                  >
                    {submitting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                    ) : (
                      "Send Message"
                    )}
                  </button>
                  <p className="text-xs text-stone-400 text-center">
                    I'll get back to you within one business day. No spam, ever.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

import { useState } from "react";
import { Mail, Phone, Clock, CheckCircle, Loader2 } from "lucide-react";
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
      <section className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-100 py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block mb-4 px-3 py-1 rounded-full text-xs font-semibold bg-[#266b75]/10 text-[#266b75] tracking-wider uppercase">
            Contact Us
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Let's Start a Conversation
          </h1>
          <p className="text-lg text-slate-500 max-w-xl mx-auto">
            Tell us about your business and what you're looking for. We'll get back to you within one business day.
          </p>
        </div>
      </section>

      {/* Contact section */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-start">
            {/* Info sidebar */}
            <div className="lg:col-span-2 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">We'd Love to Hear From You</h2>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Whether you're ready to hire a VA or just exploring your options — reach out. No sales pressure, no obligations.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-[#266b75]/10 rounded-lg flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-[#266b75]" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-0.5">Email</p>
                    <p className="text-sm text-slate-700 font-medium">hello@hmvirtualservices.com</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-[#266b75]/10 rounded-lg flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4 text-[#266b75]" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-0.5">Response Time</p>
                    <p className="text-sm text-slate-700 font-medium">Within 1 business day</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-[#266b75]/10 rounded-lg flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4 text-[#266b75]" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-0.5">Consultation</p>
                    <p className="text-sm text-slate-700 font-medium">Free 15-minute discovery call</p>
                  </div>
                </div>
              </div>

              <div className="bg-[#266b75]/5 border border-[#266b75]/15 rounded-xl p-5">
                <p className="text-sm text-[#266b75] font-semibold mb-1">Already a client?</p>
                <p className="text-sm text-slate-500">
                  Log in to your{" "}
                  <a href="/portal" className="text-[#266b75] hover:underline font-medium">
                    client portal
                  </a>{" "}
                  to message your team directly.
                </p>
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-3">
              {submitted ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-10 text-center">
                  <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Message Sent!</h3>
                  <p className="text-slate-500 text-sm">
                    Thanks for reaching out. We'll be in touch within one business day.
                  </p>
                  <button
                    onClick={() => setSubmitted(false)}
                    className="mt-6 text-sm text-[#266b75] hover:underline font-medium"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Your Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={set("name")}
                        placeholder="Jane Smith"
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:border-[#266b75] focus:ring-2 focus:ring-[#266b75]/10 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Email Address <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={set("email")}
                        placeholder="jane@example.com"
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:border-[#266b75] focus:ring-2 focus:ring-[#266b75]/10 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Business Name
                      </label>
                      <input
                        type="text"
                        value={form.business_name}
                        onChange={set("business_name")}
                        placeholder="Acme Co. (optional)"
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:border-[#266b75] focus:ring-2 focus:ring-[#266b75]/10 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={set("phone")}
                        placeholder="+1 555 000 0000 (optional)"
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:border-[#266b75] focus:ring-2 focus:ring-[#266b75]/10 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      How Can We Help? <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      required
                      rows={5}
                      value={form.message}
                      onChange={set("message")}
                      placeholder="Tell us about your business, what tasks you need help with, and any questions you have…"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:border-[#266b75] focus:ring-2 focus:ring-[#266b75]/10 transition-colors resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#266b75] text-white font-semibold rounded-xl hover:bg-[#1f5560] transition-colors disabled:opacity-60 shadow-lg"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      "Send Message"
                    )}
                  </button>
                  <p className="text-xs text-slate-400 text-center">
                    By submitting this form you agree to be contacted by HM Virtual Services regarding your inquiry.
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

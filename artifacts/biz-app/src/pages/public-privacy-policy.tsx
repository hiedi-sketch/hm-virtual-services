import { PublicLayout } from "@/components/PublicLayout";

const SECTIONS = [
  {
    number: "1.",
    title: "Introduction",
    content: (
      <p>
        HM Virtual Services ("we," "us," or "our") operates a bookkeeping and virtual assistant
        management platform ("the App") accessible at hmvirtualservices.com. This Privacy Policy
        explains how we collect, use, and protect information when you use our App.
      </p>
    ),
  },
  {
    number: "2.",
    title: "Information We Collect",
    content: (
      <div className="space-y-4">
        <div>
          <p className="font-semibold text-slate-800 mb-1">Account Information</p>
          <ul className="list-disc list-inside space-y-1 text-slate-600">
            <li>Name and email address</li>
            <li>Password (encrypted, never stored in plain text)</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-slate-800 mb-1">Business &amp; Financial Information</p>
          <ul className="list-disc list-inside space-y-1 text-slate-600">
            <li>Transaction data imported from QuickBooks Online for bookkeeping purposes</li>
            <li>Receipts and supporting documents you or your bookkeeper uploads</li>
            <li>Notes and responses related to transaction review</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-slate-800 mb-1">Payment Information</p>
          <p className="text-slate-600">
            Invoices for services are processed through Square. We do not store your payment card
            details. Square's privacy policy applies to all payment processing.{" "}
            <a
              href="https://squareup.com/legal/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#266b75] underline hover:text-[#1a4a52] transition-colors"
            >
              See square.com/legal/privacy
            </a>
          </p>
        </div>
        <div>
          <p className="font-semibold text-slate-800 mb-1">Usage Information</p>
          <ul className="list-disc list-inside space-y-1 text-slate-600">
            <li>Login timestamps</li>
            <li>Actions taken within the App (for support and security purposes)</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    number: "3.",
    title: "How We Use Your Information",
    content: (
      <div>
        <p className="text-slate-600 mb-2">We use collected information to:</p>
        <ul className="list-disc list-inside space-y-1 text-slate-600">
          <li>Provide bookkeeping and virtual assistant services</li>
          <li>Facilitate transaction review and client communication</li>
          <li>Process service invoices via Square</li>
          <li>Respond to your questions and support requests</li>
          <li>Improve the App's functionality</li>
        </ul>
      </div>
    ),
  },
  {
    number: "4.",
    title: "How We Share Your Information",
    content: (
      <div>
        <p className="text-slate-600 mb-2">
          We do not sell your personal information. We share data only with:
        </p>
        <ul className="list-disc list-inside space-y-1 text-slate-600">
          <li>
            <span className="font-medium text-slate-700">Intuit/QuickBooks</span> — to read and
            write transaction data on your behalf
          </li>
          <li>
            <span className="font-medium text-slate-700">Square</span> — to process service invoice
            payments
          </li>
          <li>
            <span className="font-medium text-slate-700">Asana / ClickUp</span> — if you have
            selected either as your preferred communication channel, task data is shared with that
            platform
          </li>
          <li>
            <span className="font-medium text-slate-700">Law enforcement</span> — if required by
            law
          </li>
        </ul>
      </div>
    ),
  },
  {
    number: "5.",
    title: "Data Retention",
    content: (
      <p>
        We retain your data for as long as you are an active client. Upon termination of services,
        your data is deleted within 90 days upon written request.
      </p>
    ),
  },
  {
    number: "6.",
    title: "International Users",
    content: (
      <p>
        Our App is primarily intended for US-based users. We have one or more non-US clients whose
        data is processed and stored on US-based servers. By using the App, non-US users consent to
        their data being transferred to and processed in the United States.
      </p>
    ),
  },
  {
    number: "7.",
    title: "Data Security",
    content: (
      <p>
        We implement reasonable technical and organizational measures to protect your information,
        including encrypted passwords and secure hosting via Replit. No method of transmission over
        the internet is 100% secure.
      </p>
    ),
  },
  {
    number: "8.",
    title: "Your Rights",
    content: (
      <p>
        You may request access to, correction of, or deletion of your personal data at any time by
        contacting us at{" "}
        <a
          href="mailto:hiedi@hmvirtualservices.com"
          className="text-[#266b75] underline hover:text-[#1a4a52] transition-colors"
        >
          hiedi@hmvirtualservices.com
        </a>
        .
      </p>
    ),
  },
  {
    number: "9.",
    title: "Cookies",
    content: (
      <p>
        The App may use session cookies to maintain your logged-in state. We do not use tracking or
        advertising cookies.
      </p>
    ),
  },
  {
    number: "10.",
    title: "Changes to This Policy",
    content: (
      <p>
        We may update this policy periodically. We will notify active users of material changes via
        email.
      </p>
    ),
  },
  {
    number: "11.",
    title: "Contact",
    content: (
      <p>
        HM Virtual Services —{" "}
        <a
          href="mailto:hiedi@hmvirtualservices.com"
          className="text-[#266b75] underline hover:text-[#1a4a52] transition-colors"
        >
          hiedi@hmvirtualservices.com
        </a>
      </p>
    ),
  },
];

export default function PrivacyPolicy() {
  return (
    <PublicLayout>
      <div className="bg-[#f8fafc] min-h-screen py-12 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-8 py-10 mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "#266b75" }}
              >
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold text-slate-900 leading-tight">
                  Privacy Policy
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">HM Virtual Services</p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 bg-[#266b75]/8 border border-[#266b75]/20 rounded-lg px-3 py-1.5">
              <span className="text-xs font-semibold text-[#266b75] uppercase tracking-wide">
                Last Updated
              </span>
              <span className="text-sm text-[#266b75] font-medium">May 29, 2026</span>
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-4">
            {SECTIONS.map((section) => (
              <div
                key={section.number}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm px-8 py-6"
              >
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-xs font-bold text-[#266b75] bg-[#266b75]/8 rounded-md px-2 py-0.5 font-mono">
                    {section.number}
                  </span>
                  <h2 className="text-base font-display font-bold text-slate-900">
                    {section.title}
                  </h2>
                </div>
                <div className="text-slate-600 text-[15px] leading-relaxed">{section.content}</div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-slate-400 space-y-1 pb-8">
            <p className="font-medium text-slate-500">HM Virtual Services</p>
            <a
              href="mailto:hiedi@hmvirtualservices.com"
              className="text-[#266b75] hover:text-[#1a4a52] transition-colors"
            >
              hiedi@hmvirtualservices.com
            </a>
            <p className="text-xs text-slate-400 mt-2">
              &copy; {new Date().getFullYear()} HM Virtual Services. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

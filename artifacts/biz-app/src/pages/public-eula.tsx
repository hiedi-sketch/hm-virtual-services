import { PublicLayout } from "@/components/PublicLayout";

const SECTIONS = [
  {
    number: "1.",
    title: "Agreement",
    content: (
      <p>
        This End-User License Agreement ("EULA") is a legal agreement between you ("User") and HM
        Virtual Services ("we," "us," "our") governing your use of the HM Virtual Services
        bookkeeping and client management platform ("the App"). By accessing or using the App, you
        agree to be bound by this EULA.
      </p>
    ),
  },
  {
    number: "2.",
    title: "License Grant",
    content: (
      <p>
        We grant you a limited, non-exclusive, non-transferable, revocable license to access and use
        the App solely for your internal business purposes in connection with bookkeeping and virtual
        assistant services provided by HM Virtual Services.
      </p>
    ),
  },
  {
    number: "3.",
    title: "Restrictions",
    content: (
      <div>
        <p className="text-slate-600 mb-2">You may not:</p>
        <ul className="list-disc list-inside space-y-1 text-slate-600">
          <li>Copy, modify, or distribute the App or its content</li>
          <li>Reverse engineer or attempt to extract the source code</li>
          <li>Use the App for any unlawful purpose</li>
          <li>Share your login credentials with any third party</li>
          <li>Access the App to build a competing product or service</li>
        </ul>
      </div>
    ),
  },
  {
    number: "4.",
    title: "Ownership",
    content: (
      <p>
        The App and all its content, features, and functionality are and will remain the exclusive
        property of HM Virtual Services. This EULA does not grant you any ownership rights.
      </p>
    ),
  },
  {
    number: "5.",
    title: "Your Data",
    content: (
      <p>
        You retain ownership of all data you upload to the App, including transaction data, receipts,
        and documents. You grant HM Virtual Services a limited license to use that data solely to
        provide the services described.
      </p>
    ),
  },
  {
    number: "6.",
    title: "Third-Party Integrations",
    content: (
      <p>
        The App integrates with third-party services including QuickBooks Online (Intuit), Square,
        Asana, and ClickUp. Your use of those services is governed by their respective terms and
        privacy policies. HM Virtual Services is not responsible for third-party service availability
        or conduct.
      </p>
    ),
  },
  {
    number: "7.",
    title: "Termination",
    content: (
      <p>
        We may terminate or suspend your access to the App at any time with reasonable notice. Upon
        termination, your right to use the App ceases immediately. You may request deletion of your
        data within 90 days of termination.
      </p>
    ),
  },
  {
    number: "8.",
    title: "Disclaimer of Warranties",
    content: (
      <p>
        The App is provided "as is" without warranties of any kind, express or implied. We do not
        warrant that the App will be error-free or uninterrupted.
      </p>
    ),
  },
  {
    number: "9.",
    title: "Limitation of Liability",
    content: (
      <p>
        To the fullest extent permitted by law, HM Virtual Services shall not be liable for any
        indirect, incidental, special, or consequential damages arising from your use of the App.
      </p>
    ),
  },
  {
    number: "10.",
    title: "Governing Law",
    content: (
      <p>
        This EULA is governed by the laws of the State of Iowa, without regard to conflict of law
        principles.
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

export default function Eula() {
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
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold text-slate-900 leading-tight">
                  End-User License Agreement
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

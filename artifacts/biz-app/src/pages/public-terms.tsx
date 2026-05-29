import { PublicLayout } from "@/components/PublicLayout";

const SECTIONS = [
  {
    number: "1.",
    title: "Acceptance of Terms",
    content: (
      <p>
        By accessing or using the HM Virtual Services platform ("the App"), you agree to these Terms
        of Service ("Terms"). If you do not agree, do not use the App.
      </p>
    ),
  },
  {
    number: "2.",
    title: "Description of Service",
    content: (
      <p>
        HM Virtual Services provides a private bookkeeping and client management platform for use by
        clients of HM Virtual Services exclusively. The App is not a public service and access is by
        invitation only.
      </p>
    ),
  },
  {
    number: "3.",
    title: "Eligibility",
    content: (
      <p>
        You must be at least 18 years of age and a current client of HM Virtual Services to use the
        App. Access is granted solely at our discretion.
      </p>
    ),
  },
  {
    number: "4.",
    title: "Account Responsibilities",
    content: (
      <div>
        <p className="text-slate-600 mb-2">You are responsible for:</p>
        <ul className="list-disc list-inside space-y-1 text-slate-600">
          <li>Maintaining the confidentiality of your login credentials</li>
          <li>All activity that occurs under your account</li>
          <li>
            Notifying us immediately at{" "}
            <a
              href="mailto:hiedi@hmvirtualservices.com"
              className="text-[#266b75] underline hover:text-[#1a4a52] transition-colors"
            >
              hiedi@hmvirtualservices.com
            </a>{" "}
            if you suspect unauthorized access
          </li>
          <li>Providing accurate information when using the App</li>
        </ul>
      </div>
    ),
  },
  {
    number: "5.",
    title: "Acceptable Use",
    content: (
      <div>
        <p className="text-slate-600 mb-2">
          You agree to use the App only for legitimate bookkeeping and business review purposes. You
          may not:
        </p>
        <ul className="list-disc list-inside space-y-1 text-slate-600">
          <li>Upload false, misleading, or fraudulent documents or transaction data</li>
          <li>Attempt to access another client's data</li>
          <li>Interfere with or disrupt the App or its servers</li>
          <li>Use the App in violation of any applicable law</li>
        </ul>
      </div>
    ),
  },
  {
    number: "6.",
    title: "Transaction Data and Receipts",
    content: (
      <p>
        You are responsible for the accuracy of any transaction data, receipts, or documents you
        upload to the App. HM Virtual Services processes this information solely to provide
        bookkeeping services and is not responsible for errors in data you provide.
      </p>
    ),
  },
  {
    number: "7.",
    title: "Payment for Services",
    content: (
      <p>
        Fees for HM Virtual Services bookkeeping and virtual assistant services are invoiced
        separately and processed through Square. Use of the App does not itself constitute a
        billable service unless otherwise agreed in your client contract.
      </p>
    ),
  },
  {
    number: "8.",
    title: "Confidentiality",
    content: (
      <p>
        All financial data, transaction information, and business documents shared through the App
        are treated as confidential. HM Virtual Services will not disclose your information to third
        parties except as described in our{" "}
        <a
          href="/privacy-policy"
          className="text-[#266b75] underline hover:text-[#1a4a52] transition-colors"
        >
          Privacy Policy
        </a>
        .
      </p>
    ),
  },
  {
    number: "9.",
    title: "Availability",
    content: (
      <p>
        We will make reasonable efforts to keep the App available and operational. We do not
        guarantee uninterrupted access and are not liable for downtime caused by maintenance,
        technical issues, or third-party service outages.
      </p>
    ),
  },
  {
    number: "10.",
    title: "Modifications to Terms",
    content: (
      <p>
        We reserve the right to update these Terms at any time. We will notify active users of
        material changes via email. Continued use of the App after changes constitutes acceptance of
        the updated Terms.
      </p>
    ),
  },
  {
    number: "11.",
    title: "Termination",
    content: (
      <p>
        We may suspend or terminate your access to the App at any time for violation of these Terms
        or at the end of your client engagement with HM Virtual Services.
      </p>
    ),
  },
  {
    number: "12.",
    title: "Dispute Resolution",
    content: (
      <p>
        Any disputes arising from these Terms or your use of the App shall be resolved through good
        faith negotiation. If unresolved, disputes shall be subject to the jurisdiction of the courts
        of the State of Iowa.
      </p>
    ),
  },
  {
    number: "13.",
    title: "Governing Law",
    content: <p>These Terms are governed by the laws of the State of Iowa.</p>,
  },
  {
    number: "14.",
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

export default function Terms() {
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
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold text-slate-900 leading-tight">
                  Terms of Service
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

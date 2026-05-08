import React from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-8">
          <div className="max-w-lg w-full bg-white border border-red-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-base font-semibold text-red-700 mb-2">Something went wrong loading this page</h2>
            <p className="text-sm text-slate-600 mb-4">
              {this.state.error.message}
            </p>
            <pre className="text-xs bg-slate-50 border border-slate-200 rounded p-3 overflow-auto text-slate-500 mb-4">
              {this.state.error.stack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#266b75] text-white text-sm rounded-lg hover:bg-[#1f5560]"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

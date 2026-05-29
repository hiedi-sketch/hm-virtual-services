import { useState, useEffect } from "react";
import { useListClients } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, CheckCircle2, XCircle, RefreshCw, Link2, Unlink,
  ChevronDown, ExternalLink, AlertCircle, Building2, Monitor, ListTodo,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const CHANNEL_LABELS: Record<string, string> = {
  dashboard: "Dashboard only",
  asana: "Asana",
  clickup: "ClickUp",
};

interface QboStatus {
  connected: boolean;
  name?: string;
  email?: string;
  firms?: QboFirm[];
}

interface QboFirm {
  realmId: string;
  companyName: string;
  country?: string;
}

interface ConnectClientModalProps {
  client: any;
  firms: QboFirm[];
  onClose: () => void;
  onSave: (clientId: number, patch: Record<string, string | null>) => Promise<void>;
}

function ConnectClientModal({ client, firms, onClose, onSave }: ConnectClientModalProps) {
  const [selectedRealm, setSelectedRealm] = useState<string>(client.qbo_realm_id ?? "");
  const [channel, setChannel] = useState<string>(client.preferred_channel ?? "dashboard");
  const [channelConfig, setChannelConfig] = useState<string>(
    client.channel_config ? (() => { try { return JSON.parse(client.channel_config)?.id ?? ""; } catch { return ""; } })() : ""
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const configVal = channelConfig.trim()
        ? JSON.stringify({ id: channelConfig.trim() })
        : null;
      await onSave(client.id, {
        qbo_realm_id: selectedRealm || null,
        preferred_channel: channel || null,
        channel_config: configVal,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const channelConfigLabel = channel === "asana" ? "Asana Project GID" : channel === "clickup" ? "ClickUp List ID" : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Connect Client</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {client.contact_name || client.name}
          </p>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              QBO Company (Firm)
            </label>
            <div className="relative">
              <select
                value={selectedRealm}
                onChange={e => setSelectedRealm(e.target.value)}
                className="w-full appearance-none border border-slate-200 rounded-xl px-3 py-2.5 pr-9 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#266b75]/40"
              >
                <option value="">— No QBO company linked —</option>
                {firms.map(f => (
                  <option key={f.realmId} value={f.realmId}>
                    {f.companyName} {f.country ? `(${f.country})` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            {selectedRealm && (
              <p className="text-[11px] text-slate-400 mt-1">Realm ID: {selectedRealm}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Preferred Task Channel
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["dashboard", "asana", "clickup"] as const).map(ch => (
                <button
                  key={ch}
                  onClick={() => setChannel(ch)}
                  className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                    channel === ch
                      ? "border-[#266b75] bg-[#266b75]/5 text-[#266b75]"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {ch === "dashboard" && <Monitor className="w-4 h-4" />}
                  {ch === "asana" && <ListTodo className="w-4 h-4" />}
                  {ch === "clickup" && <ListTodo className="w-4 h-4" />}
                  {CHANNEL_LABELS[ch]}
                </button>
              ))}
            </div>
          </div>

          {channelConfigLabel && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                {channelConfigLabel}
              </label>
              <input
                type="text"
                value={channelConfig}
                onChange={e => setChannelConfig(e.target.value)}
                placeholder={channel === "asana" ? "e.g. 1234567890" : "e.g. abc123xyz"}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/40"
              />
            </div>
          )}
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: "#266b75" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QuickBooks() {
  const { data: clients, refetch: refetchClients } = useListClients();
  const { toast } = useToast();

  const [status, setStatus] = useState<QboStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connectingClient, setConnectingClient] = useState<any | null>(null);

  const loadStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/qbo/status", { credentials: "include" });
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ connected: false });
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // Handle OAuth redirect result
    const params = new URLSearchParams(window.location.search);
    const qbo = params.get("qbo");
    if (qbo === "connected") {
      toast({ title: "QuickBooks connected successfully" });
      window.history.replaceState({}, "", "/quickbooks");
    } else if (qbo === "error") {
      toast({ title: "QuickBooks connection failed", variant: "destructive" });
      window.history.replaceState({}, "", "/quickbooks");
    }
  }, []);

  const handleConnect = () => {
    window.location.href = "/api/qbo/connect";
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect QuickBooks? This will remove the stored tokens but won't affect existing Realm IDs on clients.")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/qbo/disconnect", { method: "POST", credentials: "include" });
      toast({ title: "QuickBooks disconnected" });
      await loadStatus();
    } catch {
      toast({ title: "Failed to disconnect", variant: "destructive" });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleRefreshFirms = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/qbo/refresh-firms", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to refresh");
      toast({ title: `Firm list refreshed`, description: `${data.count} companies found` });
      await loadStatus();
    } catch (err: any) {
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveClientConfig = async (clientId: number, patch: Record<string, string | null>) => {
    const res = await fetch(`/api/qbo/clients/${clientId}/realm`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? "Failed to save");
    }
    toast({ title: "Client updated" });
    refetchClients();
  };

  const firms: QboFirm[] = status?.firms ?? [];
  const activeClients = (clients ?? []).filter(c => (c as any).is_active !== false);

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">QuickBooks</h1>
        <p className="text-slate-500 mt-1">Connect your QuickBooks Online Accountant account to link client companies.</p>
      </div>

      {/* Connection Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#2CA01C" }}>
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900">QuickBooks Online Accountant</h2>
              {!statusLoading && (
                status?.connected
                  ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Connected</span>
                  : <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" /> Not connected</span>
              )}
            </div>

            {status?.connected && (
              <p className="text-sm text-slate-500 mt-0.5">
                {status.name && <span className="font-medium text-slate-700">{status.name}</span>}
                {status.name && status.email && " · "}
                {status.email}
              </p>
            )}

            {!status?.connected && !statusLoading && (
              <p className="text-sm text-slate-500 mt-1">
                Connect once using your QBOA credentials to fetch all client companies you manage.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {status?.connected ? (
              <>
                <button
                  onClick={handleRefreshFirms}
                  disabled={refreshing}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh Firms
                </button>
                <button
                  onClick={handleConnect}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#266b75] text-sm font-medium text-[#266b75] hover:bg-[#266b75]/5 transition-colors"
                >
                  <Link2 className="w-4 h-4" />
                  Add Account
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Unlink className="w-4 h-4" />
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={handleConnect}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ background: "#266b75" }}
              >
                <Link2 className="w-4 h-4" />
                Connect QuickBooks
              </button>
            )}
          </div>
        </div>

        {!process.env.NODE_ENV || process.env.NODE_ENV !== "production" ? null : null}
      </div>

      {/* Firm list info */}
      {status?.connected && firms.length > 0 && (
        <div className="bg-slate-50 rounded-2xl border border-slate-200 px-5 py-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            {firms.length} Managed {firms.length === 1 ? "Company" : "Companies"} in QBOA
          </p>
          <div className="flex flex-wrap gap-2">
            {firms.map(f => (
              <span key={f.realmId} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 font-medium">
                <Building2 className="w-3 h-3 text-slate-400" />
                {f.companyName}
              </span>
            ))}
          </div>
        </div>
      )}

      {status?.connected && firms.length === 0 && !statusLoading && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-sm text-amber-800">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-500" />
          No companies found in your QBOA account. Make sure you have client companies added, then click <strong>Refresh Firms</strong>.
        </div>
      )}

      {/* Client Connections Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900">Client Connections</h2>
          {!status?.connected && (
            <span className="text-xs text-slate-400">Connect QuickBooks to link clients to QBO companies</span>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">QBO Company</th>
                <th className="px-5 py-3">Channel</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeClients.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-400">No active clients.</td>
                </tr>
              )}
              {activeClients.map(client => {
                const realm = (client as any).qbo_realm_id as string | null;
                const firm = realm ? firms.find(f => f.realmId === realm) : null;
                const ch = (client as any).preferred_channel as string | null;
                const cfgRaw = (client as any).channel_config as string | null;
                let cfgId: string | null = null;
                try { cfgId = cfgRaw ? JSON.parse(cfgRaw)?.id : null; } catch {}

                return (
                  <tr key={client.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-800">{client.contact_name || client.name}</div>
                      {client.contact_name && <div className="text-xs text-slate-400">{client.name}</div>}
                    </td>
                    <td className="px-5 py-3">
                      {firm ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {firm.companyName}
                        </span>
                      ) : realm ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Realm {realm} (not in firm list)
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">— not linked —</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {ch ? (
                        <span className="text-sm text-slate-700">
                          {CHANNEL_LABELS[ch] ?? ch}
                          {cfgId && <span className="ml-1 text-xs text-slate-400">({cfgId})</span>}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setConnectingClient(client)}
                        className="text-xs font-medium text-[#266b75] hover:underline"
                      >
                        {realm || ch ? "Edit" : "Connect"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Setup instructions when not connected */}
      {!status?.connected && !statusLoading && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
          <h3 className="font-bold text-slate-900">Setup Instructions</h3>
          <ol className="space-y-2 text-sm text-slate-600 list-decimal list-inside">
            <li>Go to <a href="https://developer.intuit.com" target="_blank" rel="noopener noreferrer" className="text-[#266b75] underline inline-flex items-center gap-0.5">developer.intuit.com <ExternalLink className="w-3 h-3" /></a> and open your app</li>
            <li>Under <strong>Keys &amp; OAuth</strong>, add this redirect URI: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">https://hmvirtualservices.com/api/qbo/callback</code></li>
            <li>Click <strong>Connect QuickBooks</strong> above and sign in with your QBOA credentials</li>
            <li>Your managed client companies will be fetched automatically</li>
          </ol>
        </div>
      )}

      {connectingClient && (
        <ConnectClientModal
          client={connectingClient}
          firms={firms}
          onClose={() => setConnectingClient(null)}
          onSave={handleSaveClientConfig}
        />
      )}
    </div>
  );
}

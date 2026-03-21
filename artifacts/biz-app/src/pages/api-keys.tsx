import { useState } from "react";
import { Key, Plus, Trash2, Copy, Check, Loader2, AlertTriangle, Code2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ApiKeyRow {
  id: number;
  name: string;
  key_preview: string;
  created_at: string;
}

interface CreatedKey {
  id: number;
  name: string;
  key: string;
  created_at: string;
}

async function fetchKeys(): Promise<ApiKeyRow[]> {
  const res = await fetch("/api/apikeys", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load API keys");
  return res.json() as Promise<ApiKeyRow[]>;
}

const ENDPOINTS = [
  { method: "GET", path: "/api/external/tasks",    description: "All tasks with client, status, due date, assignee" },
  { method: "GET", path: "/api/external/clients",  description: "All clients with service type, budget, fee, status" },
  { method: "GET", path: "/api/external/time",     description: "All time entries with client, duration, date" },
  { method: "GET", path: "/api/external/leads",    description: "All CRM leads with status and estimated value" },
  { method: "GET", path: "/api/external/invoices", description: "All invoices with amount, status, and due date" },
];

export default function ApiKeys() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const { data: keys = [], isLoading } = useQuery<ApiKeyRow[]>({
    queryKey: ["apikeys"],
    queryFn: fetchKeys,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/apikeys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to create key");
      return res.json() as Promise<CreatedKey>;
    },
    onSuccess: (data) => {
      setCreatedKey(data);
      setNewName("");
      qc.invalidateQueries({ queryKey: ["apikeys"] });
    },
    onError: () => {
      toast({ title: "Could not create API key", variant: "destructive" });
    },
  });

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/apikeys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      qc.invalidateQueries({ queryKey: ["apikeys"] });
      toast({ title: "API key revoked" });
    } catch {
      toast({ title: "Could not revoke key", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">API Keys</h1>
        <p className="text-slate-500 mt-1">
          Generate keys to access Flowstate data from external tools and automations. Keys grant read-only access.
        </p>
      </div>

      {/* New key revealed after creation */}
      {createdKey && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-emerald-600" />
            <p className="text-sm font-semibold text-emerald-800">
              Copy this key now — it won't be shown again.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm bg-white border border-emerald-200 rounded-lg px-3 py-2 font-mono text-slate-800 break-all">
              {createdKey.key}
            </code>
            <button
              onClick={() => handleCopy(createdKey.key)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => setCreatedKey(null)}
            className="text-xs text-emerald-600 hover:underline"
          >
            I've saved this key — dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Key list */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-slate-500" />
              <h2 className="font-semibold text-slate-900">Active Keys</h2>
              <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{keys.length}</span>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">No API keys yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {keys.map(k => (
                <li key={k.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 text-sm truncate">{k.name}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{k.key_preview}</p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(k.created_at + (k.created_at.endsWith("Z") ? "" : "Z")).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => handleDelete(k.id)}
                    disabled={deleting === k.id}
                    className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                    title="Revoke key"
                  >
                    {deleting === k.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />
                    }
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Create form */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Generate New Key</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Key name (e.g. Zapier, Make, n8n)"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && newName.trim() && createMutation.mutate(newName.trim())}
                className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <button
                onClick={() => newName.trim() && createMutation.mutate(newName.trim())}
                disabled={!newName.trim() || createMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {createMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Plus className="w-4 h-4" />
                }
                Generate
              </button>
            </div>
          </div>
        </div>

        {/* Endpoint reference */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
              <Code2 className="w-4 h-4 text-slate-500" />
              <h2 className="font-semibold text-slate-900">Available Endpoints</h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {ENDPOINTS.map(ep => (
                <li key={ep.path} className="px-6 py-3">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                      {ep.method}
                    </span>
                    <code className="text-xs font-mono text-slate-700">{ep.path}</code>
                  </div>
                  <p className="text-xs text-slate-500 ml-10">{ep.description}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-700">How to use</h3>
            </div>
            <div className="space-y-2 text-sm text-slate-600">
              <p>Pass your key via one of two methods:</p>
              <div className="space-y-1.5">
                <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Header</p>
                  <code className="text-xs font-mono text-slate-700">X-API-Key: fs_your_key_here</code>
                </div>
                <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Authorization</p>
                  <code className="text-xs font-mono text-slate-700">Authorization: Bearer fs_your_key_here</code>
                </div>
              </div>
              <p className="text-xs text-slate-400 pt-1">
                All endpoints return JSON with a <code className="font-mono">data</code> array and a <code className="font-mono">count</code>.
                Keys provide read-only access — no writes are possible via the external API.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Plus, Trash2, Pencil, X, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useListClients } from "@workspace/api-client-react";

interface User {
  id: number;
  email: string;
  name: string;
  role: "admin" | "team_member" | "client";
  client_id: number | null;
  client_name?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  team_member: "Team Member",
  client: "Client",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-violet-100 text-violet-800",
  team_member: "bg-blue-100 text-blue-800",
  client: "bg-green-100 text-green-800",
};

function useUsers() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchUsers() {
    setLoading(true);
    try {
      const r = await fetch("/api/users", { credentials: "include" });
      if (r.ok) setUsers(await r.json());
    } finally {
      setLoading(false);
    }
  }

  return { users, loading, fetchUsers, setUsers };
}

interface CreateForm {
  email: string;
  password: string;
  name: string;
  role: "admin" | "team_member" | "client";
  client_id: string;
}

export default function Team() {
  const { toast } = useToast();
  const { data: clients = [] } = useListClients();
  const [users, setUsers] = useState<User[] | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<CreateForm>>({});
  const [form, setForm] = useState<CreateForm>({
    email: "",
    password: "",
    name: "",
    role: "team_member",
    client_id: "",
  });
  const [submitting, setSubmitting] = useState(false);

  async function fetchUsers() {
    setLoadingUsers(true);
    try {
      const r = await fetch("/api/users", { credentials: "include" });
      if (r.ok) setUsers(await r.json());
    } finally {
      setLoadingUsers(false);
    }
  }

  if (!users && !loadingUsers) {
    fetchUsers();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await fetch("/api/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          client_id: form.client_id ? parseInt(form.client_id) : null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to create user");
      }
      toast({ title: "User created" });
      setShowForm(false);
      setForm({ email: "", password: "", name: "", role: "team_member", client_id: "" });
      fetchUsers();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(id: number) {
    try {
      const body: Record<string, unknown> = { ...editForm };
      if (editForm.client_id !== undefined) {
        body["client_id"] = editForm.client_id ? parseInt(editForm.client_id as string) : null;
      }
      const r = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed to update user");
      toast({ title: "User updated" });
      setEditId(null);
      setEditForm({});
      fetchUsers();
    } catch {
      toast({ title: "Error", description: "Failed to update user", variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this user?")) return;
    try {
      await fetch(`/api/users/${id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "User deleted" });
      fetchUsers();
    } catch {
      toast({ title: "Error", description: "Failed to delete user", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team & Access</h1>
          <p className="text-slate-500 text-sm mt-1">Manage users and their roles.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">New User</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Jane Smith"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Email</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="jane@example.com"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Password</label>
              <input
                required
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Min 6 characters"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as CreateForm["role"] }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="admin">Admin</option>
                <option value="team_member">Team Member</option>
                <option value="client">Client</option>
              </select>
            </div>
            {form.role === "client" && (
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-slate-600">Link to Client</label>
                <select
                  value={form.client_id}
                  onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">— No client linked —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create User"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loadingUsers ? (
          <p className="text-sm text-slate-400 p-6">Loading…</p>
        ) : !users || users.length === 0 ? (
          <p className="text-sm text-slate-400 p-6">No users yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 font-medium text-slate-500">Name</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Email</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Role</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Client</th>
                <th className="text-right px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-800">
                    {editId === user.id ? (
                      <input
                        value={editForm.name ?? user.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className="border border-slate-200 rounded px-2 py-1 text-sm w-32"
                      />
                    ) : (
                      user.name
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{user.email}</td>
                  <td className="px-5 py-3">
                    {editId === user.id ? (
                      <select
                        value={editForm.role ?? user.role}
                        onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as User["role"] }))}
                        className="border border-slate-200 rounded px-2 py-1 text-sm"
                      >
                        <option value="admin">Admin</option>
                        <option value="team_member">Team Member</option>
                        <option value="client">Client</option>
                      </select>
                    ) : (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[user.role] ?? ""}`}>
                        {ROLE_LABELS[user.role]}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {editId === user.id ? (
                      <select
                        value={editForm.client_id ?? (user.client_id?.toString() ?? "")}
                        onChange={(e) => setEditForm((f) => ({ ...f, client_id: e.target.value }))}
                        className="border border-slate-200 rounded px-2 py-1 text-sm"
                      >
                        <option value="">— None —</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    ) : (
                      user.client_name ?? <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {editId === user.id ? (
                        <>
                          <button
                            onClick={() => handleUpdate(user.id)}
                            className="p-1.5 rounded-lg text-green-600 hover:bg-green-50"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setEditId(null); setEditForm({}); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setEditId(user.id); setEditForm({}); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

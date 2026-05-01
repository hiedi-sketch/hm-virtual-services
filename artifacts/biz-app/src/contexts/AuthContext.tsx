import { createContext, useContext, useEffect, useRef, useState } from "react";

export type UserRole = "admin" | "team_member" | "client";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  client_id: number | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (u: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Global auth-aware fetch — replaces window.fetch once AuthProvider mounts.
// On any 401 (except auth endpoints) it fires a custom event that AuthProvider
// listens for, clears the user and redirects to /login.
const AUTH_ENDPOINTS = ["/api/auth/login", "/api/auth/logout", "/api/auth/me"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionExpiredRef = useRef(false);

  // Patch global fetch once on mount to detect 401 session expiry everywhere.
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (
        response.status === 401 &&
        !sessionExpiredRef.current &&
        !AUTH_ENDPOINTS.some(ep => args[0]?.toString().includes(ep))
      ) {
        sessionExpiredRef.current = true;
        setUser(null);
        // Small delay so the current toast/UI update can render first
        setTimeout(() => {
          window.location.href = "/login?reason=session_expired";
        }, 800);
      }
      return response;
    };
    return () => { window.fetch = originalFetch; };
  }, []);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Login failed");
    }
    const u = await res.json();
    sessionExpiredRef.current = false;
    setUser(u);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  }

  async function refreshUser() {
    const u = await fetch("/api/auth/me", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);
    setUser(u);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

import type { Request, Response, NextFunction } from "express";

export type UserRole = "admin" | "team_member" | "client";

const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const last = req.session.lastActivity ?? Date.now();
  if (Date.now() - last > IDLE_TIMEOUT_MS) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Session expired due to inactivity. Please log in again." });
    return;
  }

  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const last = req.session.lastActivity ?? Date.now();
  if (Date.now() - last > IDLE_TIMEOUT_MS) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Session expired due to inactivity. Please log in again." });
    return;
  }

  if (req.session.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const last = req.session.lastActivity ?? Date.now();
    if (Date.now() - last > IDLE_TIMEOUT_MS) {
      req.session.destroy(() => {});
      res.status(401).json({ error: "Session expired due to inactivity. Please log in again." });
      return;
    }

    if (!roles.includes(req.session.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

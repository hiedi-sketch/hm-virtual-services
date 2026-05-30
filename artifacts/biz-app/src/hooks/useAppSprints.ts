import { useState, useEffect } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type TaskStatus = "todo" | "in-progress" | "done" | "blocked";

export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  description?: string;
  phase?: string;
  priority?: "low" | "medium" | "high" | "critical";
  estimatedHours?: number;
  plannedStartDate?: string;
  dependsOn?: string;
  blocking?: string;
  plannedDueDate?: string;
  adjustedDueDate?: string;
  actualDate?: string;
  notes?: string;
  claudePromptRef?: string;
};

export type Sprint = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  tasks: Task[];
  createdAt?: unknown;
};

export type SprintStats = {
  total: number;
  done: number;
  pct: number;
  projectedDate: Date | null;
  daysAheadBehind: number | null;
};

export type ScheduleEntry = {
  estimatedDays: number | null;
  plannedDue: Date | null;
  adjustedDue: Date | null;
};

export type ScheduleResult = {
  taskDates: Map<string, ScheduleEntry>;
  projectedLaunchDate: Date | null;
  daysAheadBehind: number | null;
};

// ── Auto-calculation engine ──────────────────────────────────────────────────
// Pure function — never writes to Firebase. Runs on every render from stored data.
export function computeSchedule(
  sprints: Sprint[],
  dailyHoursAvailable: number,
  originalTargetDate: string,
): ScheduleResult {
  const allTasks = sprints.flatMap(s => s.tasks ?? []);
  const hpd = dailyHoursAvailable > 0 ? dailyHoursAvailable : 0;

  // Build lookup maps for dependency resolution
  const byId    = new Map<string, Task>();
  const byShort = new Map<string, Task>();
  const byTitle = new Map<string, Task>();
  for (const t of allTasks) {
    byId.set(t.id, t);
    byShort.set(t.id.replace(/-/g, "").slice(0, 6).toUpperCase(), t);
    byTitle.set(t.title.trim().toLowerCase(), t);
  }

  const resolveTask = (depStr?: string): Task | null => {
    if (!depStr?.trim()) return null;
    const s = depStr.trim();
    return byId.get(s)
      ?? byShort.get(s.toUpperCase())
      ?? byTitle.get(s.toLowerCase())
      ?? null;
  };

  const toDate = (s?: string): Date | null => {
    if (!s) return null;
    const d = new Date(s + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  };

  const addDays = (d: Date, days: number): Date =>
    new Date(d.getTime() + days * 86_400_000);

  // Initialise entries
  const entries = new Map<string, ScheduleEntry>();
  for (const t of allTasks) {
    const estimatedDays = (t.estimatedHours && hpd > 0)
      ? t.estimatedHours / hpd
      : null;

    let plannedDue: Date | null = null;
    if (t.plannedStartDate && estimatedDays !== null) {
      const start = toDate(t.plannedStartDate);
      if (start) plannedDue = addDays(start, estimatedDays);
    } else {
      plannedDue = toDate(t.plannedDueDate);
    }

    entries.set(t.id, { estimatedDays, plannedDue, adjustedDue: null });
  }

  // Iteratively resolve adjustedDue (handles dependency chains; capped at 20 passes)
  for (let pass = 0; pass < 20; pass++) {
    let changed = false;
    for (const t of allTasks) {
      const entry = entries.get(t.id)!;
      let adj: Date | null = null;

      // 1. Task done with actual date → use that
      if (t.status === "done" && t.actualDate) {
        adj = toDate(t.actualDate);
      }
      // 2. User has manually set adjustedDueDate → honour it
      else if (t.adjustedDueDate) {
        adj = toDate(t.adjustedDueDate);
      }
      // 3. Has a dependency → start after dep finishes
      else {
        const dep = resolveTask(t.dependsOn);
        if (dep) {
          const depEntry = entries.get(dep.id);
          const depAdj   = depEntry?.adjustedDue ?? depEntry?.plannedDue;
          if (depAdj) {
            const startAfter = addDays(depAdj, 1); // 1-day buffer
            adj = entry.estimatedDays !== null
              ? addDays(startAfter, entry.estimatedDays)
              : startAfter;
          }
        }
        // 4. No dep → use plannedDue
        if (!adj) adj = entry.plannedDue;
      }

      if (adj?.getTime() !== entry.adjustedDue?.getTime()) {
        entries.set(t.id, { ...entry, adjustedDue: adj });
        changed = true;
      }
    }
    if (!changed) break;
  }

  // projectedLaunchDate = latest adjustedDue across all tasks
  let projectedLaunchDate: Date | null = null;
  for (const e of entries.values()) {
    const d = e.adjustedDue ?? e.plannedDue;
    if (d && (!projectedLaunchDate || d > projectedLaunchDate)) {
      projectedLaunchDate = d;
    }
  }

  // daysAheadBehind: positive = ahead of target, negative = behind
  let daysAheadBehind: number | null = null;
  if (projectedLaunchDate && originalTargetDate) {
    const target = toDate(originalTargetDate);
    if (target) {
      daysAheadBehind = Math.round(
        (target.getTime() - projectedLaunchDate.getTime()) / 86_400_000
      );
    }
  }

  return { taskDates: entries, projectedLaunchDate, daysAheadBehind };
}

// ── Velocity-based stats (progress % + velocity projection) ──────────────────
export function computeSprintStats(sprints: Sprint[], targetDate: string): SprintStats {
  const allTasks = sprints.flatMap(s => s.tasks ?? []);
  const total = allTasks.length;
  const done  = allTasks.filter(t => t.status === "done").length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  let projectedDate: Date | null = null;
  if (total > 0 && done > 0) {
    const startTs = sprints
      .map(s => s.startDate ? new Date(s.startDate + "T00:00:00").getTime() : NaN)
      .filter(t => !isNaN(t));
    if (startTs.length > 0) {
      const earliest      = Math.min(...startTs);
      const daysElapsed   = Math.max(1, (Date.now() - earliest) / 86_400_000);
      const velocity      = done / daysElapsed;
      const daysToFinish  = (total - done) / velocity;
      projectedDate       = new Date(Date.now() + daysToFinish * 86_400_000);
    }
  }

  let daysAheadBehind: number | null = null;
  if (projectedDate && targetDate) {
    const target = new Date(targetDate + "T00:00:00");
    daysAheadBehind = Math.round(
      (target.getTime() - projectedDate.getTime()) / 86_400_000
    );
  }

  return { total, done, pct, projectedDate, daysAheadBehind };
}

// ── Firebase hook ─────────────────────────────────────────────────────────────
export function useAppSprints(appId: number | string) {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    const colRef = collection(db, "appTracker", String(appId), "sprints");
    const unsub  = onSnapshot(
      colRef,
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Sprint));
        data.sort((a, b) => a.name.localeCompare(b.name));
        setSprints(data);
        setLoading(false);
      },
      (err) => { console.error("Firestore error:", err); setError(err.message); setLoading(false); },
    );
    return () => unsub();
  }, [appId]);

  const addSprint = async (sprint: Omit<Sprint, "id" | "createdAt">) => {
    const colRef = collection(db, "appTracker", String(appId), "sprints");
    await addDoc(colRef, { ...sprint, tasks: sprint.tasks ?? [], createdAt: serverTimestamp() });
  };

  const updateSprint = async (sprintId: string, updates: Partial<Omit<Sprint, "id">>) => {
    const ref = doc(db, "appTracker", String(appId), "sprints", sprintId);
    await updateDoc(ref, updates as Record<string, unknown>);
  };

  const deleteSprint = async (sprintId: string) => {
    const ref = doc(db, "appTracker", String(appId), "sprints", sprintId);
    await deleteDoc(ref);
  };

  return { sprints, loading, error, addSprint, updateSprint, deleteSprint };
}

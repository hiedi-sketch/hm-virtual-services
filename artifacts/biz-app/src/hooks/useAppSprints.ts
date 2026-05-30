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

export function computeSprintStats(sprints: Sprint[], targetDate: string): SprintStats {
  const allTasks = sprints.flatMap(s => s.tasks ?? []);
  const total = allTasks.length;
  const done = allTasks.filter(t => t.status === "done").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  let projectedDate: Date | null = null;

  if (total > 0 && done > 0) {
    const startTimestamps = sprints
      .map(s => s.startDate ? new Date(s.startDate + "T00:00:00").getTime() : NaN)
      .filter(t => !isNaN(t));

    if (startTimestamps.length > 0) {
      const earliest = Math.min(...startTimestamps);
      const daysElapsed = Math.max(1, (Date.now() - earliest) / 86_400_000);
      const velocity = done / daysElapsed;
      const remaining = total - done;
      const daysToFinish = remaining / velocity;
      projectedDate = new Date(Date.now() + daysToFinish * 86_400_000);
    }
  }

  let daysAheadBehind: number | null = null;
  if (projectedDate && targetDate) {
    const target = new Date(targetDate + "T00:00:00");
    daysAheadBehind = Math.round((target.getTime() - projectedDate.getTime()) / 86_400_000);
  }

  return { total, done, pct, projectedDate, daysAheadBehind };
}

export function useAppSprints(appId: number | string) {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const colRef = collection(db, "appTracker", String(appId), "sprints");
    const unsub = onSnapshot(
      colRef,
      (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sprint));
        data.sort((a, b) => a.name.localeCompare(b.name));
        setSprints(data);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore error:", err);
        setError(err.message);
        setLoading(false);
      }
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

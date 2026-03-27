import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createTimeEntry } from "@workspace/api-client-react";

const STORAGE_KEY = "flowstate_global_timer_v3";

export type TimerStatus = "idle" | "running" | "paused";
export type ServiceType = "Bookkeeping" | "Virtual Assistant" | null;

export interface TimerState {
  status: TimerStatus;
  startedAt: number | null;
  accumulatedMs: number;
  firstStartedAt: number | null;
  clientId: number | null;
  clientName: string | null;
  taskId: number | null;
  taskTitle: string | null;
  serviceType: ServiceType;
  notes: string | null;
}

const DEFAULT_STATE: TimerState = {
  status: "idle",
  startedAt: null,
  accumulatedMs: 0,
  firstStartedAt: null,
  clientId: null,
  clientName: null,
  taskId: null,
  taskTitle: null,
  serviceType: null,
  notes: null,
};

interface TimerContextValue {
  state: TimerState;
  elapsedMs: number;
  start: () => void;
  pause: () => void;
  stop: () => void;
  assignClient: (id: number, name: string) => void;
  assignTask: (id: number, title: string) => void;
  setServiceType: (type: ServiceType) => void;
  setNotes: (notes: string | null) => void;
  startForTask: (
    taskId: number,
    taskTitle: string,
    clientId?: number | null,
    clientName?: string | null,
    serviceType?: ServiceType,
  ) => void;
  saveAndStop: () => Promise<void>;
}

const TimerContext = createContext<TimerContextValue | null>(null);

function loadState(): TimerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(s: TimerState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function getTodayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [state, setStateRaw] = useState<TimerState>(loadState);
  const [elapsedMs, setElapsedMs] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setState = useCallback((next: TimerState) => {
    setStateRaw(next);
    saveState(next);
  }, []);

  // Sync state across windows (popout ↔ main) via localStorage storage events
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const fresh = { ...DEFAULT_STATE, ...JSON.parse(e.newValue) };
          setStateRaw(fresh);
        } catch {}
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const computeElapsed = useCallback((s: TimerState): number => {
    if (s.status === "running" && s.startedAt != null) {
      return s.accumulatedMs + (Date.now() - s.startedAt);
    }
    return s.accumulatedMs;
  }, []);

  useEffect(() => {
    setElapsedMs(computeElapsed(state));
  }, [state, computeElapsed]);

  useEffect(() => {
    if (state.status === "running") {
      intervalRef.current = setInterval(() => {
        setElapsedMs(computeElapsed(state));
      }, 500);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state, computeElapsed]);

  const start = useCallback(() => {
    const now = Date.now();
    setState({
      ...state,
      status: "running",
      startedAt: now,
      firstStartedAt: state.firstStartedAt ?? now,
    });
  }, [state, setState]);

  const pause = useCallback(() => {
    if (state.status !== "running") return;
    setState({
      ...state,
      status: "paused",
      accumulatedMs: computeElapsed(state),
      startedAt: null,
    });
  }, [state, setState, computeElapsed]);

  const stop = useCallback(() => {
    setState({ ...DEFAULT_STATE });
  }, [setState]);

  const assignClient = useCallback((id: number, name: string) => {
    setState({ ...state, clientId: id, clientName: name });
  }, [state, setState]);

  const assignTask = useCallback((id: number, title: string) => {
    setState({ ...state, taskId: id, taskTitle: title });
  }, [state, setState]);

  const setServiceType = useCallback((type: ServiceType) => {
    setState({ ...state, serviceType: type });
  }, [state, setState]);

  const setNotes = useCallback((notes: string | null) => {
    setState({ ...state, notes });
  }, [state, setState]);

  const startForTask = useCallback((
    taskId: number,
    taskTitle: string,
    clientId?: number | null,
    clientName?: string | null,
    serviceType?: ServiceType,
  ) => {
    if (state.status === "running" && state.taskId === taskId) {
      pause();
      return;
    }
    const now = Date.now();
    setState({
      status: "running",
      startedAt: now,
      accumulatedMs: 0,
      firstStartedAt: now,
      clientId: clientId ?? null,
      clientName: clientName ?? null,
      taskId,
      taskTitle,
      serviceType: serviceType ?? null,
    });
  }, [state, setState, pause]);

  const saveAndStop = useCallback(async () => {
    const totalMs = computeElapsed(state);
    const duration_minutes = Math.max(1, Math.round(totalMs / 60000));
    const started_at = state.firstStartedAt ? new Date(state.firstStartedAt).toISOString() : undefined;
    const ended_at = new Date().toISOString();

    await createTimeEntry({
      client_id: state.clientId ?? undefined,
      task_id: state.taskId ?? undefined,
      duration_minutes,
      date: getTodayLocal(),
      started_at: started_at ?? null,
      ended_at,
      service_type: state.serviceType,
      notes: state.notes ?? undefined,
    } as any);

    setState({ ...DEFAULT_STATE });
  }, [state, setState, computeElapsed]);

  return (
    <TimerContext.Provider value={{ state, elapsedMs, start, pause, stop, assignClient, assignTask, setServiceType, setNotes, startForTask, saveAndStop }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer must be used within TimerProvider");
  return ctx;
}

export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

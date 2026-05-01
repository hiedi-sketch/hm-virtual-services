import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  CheckSquare, Square, ChevronDown, ChevronUp, RotateCcw,
  ClipboardList, Loader2, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Checklist definition ────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  label: string;
}

export interface Phase {
  id: string;
  title: string;
  /** if set, phase only renders when service matches */
  onlyFor?: ("bookkeeping" | "va" | "hybrid")[];
  items: ChecklistItem[];
}

export const PHASES: Phase[] = [
  {
    id: "p1",
    title: "Phase 1 — Before They Sign",
    items: [
      { id: "p1-1", label: "Initial discovery call completed" },
      { id: "p1-2", label: "Client needs and scope documented" },
      { id: "p1-3", label: "Services and pricing determined" },
      { id: "p1-4", label: "Send estimate / proposal for acceptance" },
      { id: "p1-5", label: "Follow up on estimate if no response within 3 business days" },
      { id: "p1-6", label: "Estimate accepted" },
      { id: "p1-7", label: "Send contract for signature" },
      { id: "p1-8", label: "Confirm contract is signed" },
      { id: "p1-9", label: "Collect deposit or first invoice payment if required" },
      { id: "p1-10", label: "Payment received and confirmed" },
    ],
  },
  {
    id: "p2",
    title: "Phase 2 — Welcome & Setup",
    items: [
      { id: "p2-1", label: "Send welcome email" },
      { id: "p2-2", label: "Send onboarding questionnaire / intake form" },
      { id: "p2-3", label: "Completed intake form received and reviewed" },
      { id: "p2-4", label: "Set up client folder" },
      { id: "p2-5", label: "Add client to project management tool" },
      { id: "p2-6", label: "Add client to invoicing/accounting software" },
      { id: "p2-7", label: "Create client portal login and send access details" },
      { id: "p2-8", label: "Add client contact info to CRM or client list" },
      { id: "p2-9", label: "Schedule kickoff call" },
    ],
  },
  {
    id: "p3",
    title: "Phase 3 — Kickoff Call",
    items: [
      { id: "p3-1", label: "Kickoff call completed" },
      { id: "p3-2", label: "Reviewed scope of work and expectations" },
      { id: "p3-3", label: "Confirmed communication preferences" },
      { id: "p3-4", label: "Confirmed preferred meeting cadence" },
      { id: "p3-5", label: "Confirmed deadlines and deliverable schedule" },
      { id: "p3-6", label: "Answered any client questions" },
      { id: "p3-7", label: "Sent kickoff call recap/summary email to client" },
    ],
  },
  {
    id: "p4",
    title: "Phase 4 — Bookkeeping Setup",
    onlyFor: ["bookkeeping", "hybrid"],
    items: [
      { id: "p4-1", label: "Gained access to their accounting software" },
      { id: "p4-2", label: "Reviewed existing books for accuracy / cleanup needed" },
      { id: "p4-3", label: "Noted cleanup scope if applicable" },
      { id: "p4-4", label: "Gained access to bank and credit card accounts" },
      { id: "p4-5", label: "Confirmed chart of accounts is set up correctly" },
      { id: "p4-6", label: "Confirmed fiscal year and reporting preferences" },
      { id: "p4-7", label: "Set up recurring tasks / due date reminders for monthly close" },
      { id: "p4-8", label: "Confirmed how they will send receipts and documents" },
      { id: "p4-9", label: "First month/period reconciliation completed" },
      { id: "p4-10", label: "Sent first financial report or update to client" },
    ],
  },
  {
    id: "p5",
    title: "Phase 5 — VA Setup",
    onlyFor: ["va", "hybrid"],
    items: [
      { id: "p5-1", label: "Received access to email and/or calendar" },
      { id: "p5-2", label: "Received access to all relevant tools and platforms" },
      { id: "p5-3", label: "Reviewed existing workflows or SOPs if available" },
      { id: "p5-4", label: "Documented recurring tasks and their frequency" },
      { id: "p5-5", label: "Clarified priorities and how to handle urgent requests" },
      { id: "p5-6", label: "Confirmed response time expectations on both sides" },
      { id: "p5-7", label: "First batch of tasks assigned or identified" },
      { id: "p5-8", label: "First tasks completed and delivered" },
    ],
  },
  {
    id: "p6",
    title: "Phase 6 — Wrap-Up & Ongoing",
    items: [
      { id: "p6-1", label: "Send 1-week check-in email" },
      { id: "p6-2", label: "Confirm client knows how to reach me and submit requests" },
      { id: "p6-3", label: "Schedule first recurring check-in or reporting call" },
      { id: "p6-4", label: "Add recurring invoice to billing schedule" },
      { id: "p6-5", label: "Client marked as Active in the system" },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getVisiblePhases(serviceType: string | null | undefined): Phase[] {
  const st = serviceType?.toLowerCase() ?? "";
  return PHASES.filter(p => {
    if (!p.onlyFor) return true;
    return p.onlyFor.includes(st as any);
  });
}

// ─── Phase Row ───────────────────────────────────────────────────────────────

function PhaseSection({
  phase,
  checked,
  onToggle,
  defaultOpen,
}: {
  phase: Phase;
  checked: Set<string>;
  onToggle: (id: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const doneCount = phase.items.filter(i => checked.has(i.id)).length;
  const allDone = doneCount === phase.items.length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* Phase header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800 text-sm">{phase.title}</span>
            {allDone && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                Complete
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 bg-slate-100 rounded-full h-1.5 max-w-[140px]">
              <div
                className="h-1.5 rounded-full bg-[#266b75] transition-all"
                style={{ width: `${(doneCount / phase.items.length) * 100}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 shrink-0">
              {doneCount}/{phase.items.length}
            </span>
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        )}
      </button>

      {/* Items */}
      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-50">
          {phase.items.map(item => {
            const done = checked.has(item.id);
            return (
              <label
                key={item.id}
                className="flex items-start gap-3 px-5 py-3 cursor-pointer hover:bg-slate-50/70 transition-colors select-none"
              >
                <div className="pt-0.5 shrink-0">
                  {done ? (
                    <CheckSquare className="w-4 h-4 text-[#266b75]" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-300" />
                  )}
                </div>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={done}
                  onChange={() => onToggle(item.id)}
                />
                <span className={`text-sm leading-relaxed ${done ? "line-through text-slate-400" : "text-slate-700"}`}>
                  {item.label}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  clientId: number;
  clientName: string;
  serviceType: string | null | undefined;
}

export function ClientOnboardingChecklist({ clientId, clientName, serviceType }: Props) {
  const { toast } = useToast();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ checked_items: string[]; notes: string } | null>(null);

  const visiblePhases = getVisiblePhases(serviceType);
  const totalItems = visiblePhases.reduce((s, p) => s + p.items.length, 0);
  const doneCount = [...checked].filter(id =>
    visiblePhases.some(p => p.items.some(i => i.id === id))
  ).length;
  const pct = totalItems === 0 ? 0 : Math.round((doneCount / totalItems) * 100);

  // Load checklist state
  useEffect(() => {
    setLoading(true);
    fetch(`/api/clients/${clientId}/checklist`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        setChecked(new Set(data.checked_items ?? []));
        setNotes(data.notes ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId]);

  // Debounced auto-save
  const scheduleSave = useCallback((newChecked: Set<string>, newNotes: string) => {
    pendingRef.current = { checked_items: [...newChecked], notes: newNotes };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!pendingRef.current) return;
      setSaving(true);
      try {
        await fetch(`/api/clients/${clientId}/checklist`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pendingRef.current),
        });
        pendingRef.current = null;
      } catch {
        toast({ title: "Failed to save checklist", variant: "destructive" });
      } finally {
        setSaving(false);
      }
    }, 800);
  }, [clientId, toast]);

  const handleToggle = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      scheduleSave(next, notes);
      return next;
    });
  };

  const handleNotesChange = (val: string) => {
    setNotes(val);
    scheduleSave(checked, val);
  };

  const handleReset = async () => {
    const empty = new Set<string>();
    setChecked(empty);
    setNotes("");
    setShowResetConfirm(false);
    setSaving(true);
    try {
      await fetch(`/api/clients/${clientId}/checklist`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked_items: [], notes: "" }),
      });
      toast({ title: "Checklist reset" });
    } catch {
      toast({ title: "Failed to reset", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading checklist…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header / progress */}
      <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[#266b75]" />
              <span className="text-sm font-semibold text-slate-800">{clientName}</span>
              {serviceType && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#266b75]/10 text-[#266b75] border border-[#266b75]/20">
                  {serviceType === "hybrid" ? "Bookkeeping & VA" : serviceType === "bookkeeping" ? "Bookkeeping" : "VA"}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{doneCount} of {totalItems} tasks complete</p>
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
            <span className="text-2xl font-bold text-[#266b75]">{pct}%</span>
          </div>
        </div>
        <div className="mt-3 bg-slate-100 rounded-full h-2.5">
          <div
            className="h-2.5 rounded-full bg-[#266b75] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {pct === 100 && (
          <p className="text-xs text-emerald-600 font-semibold mt-2 text-center">
            Onboarding complete!
          </p>
        )}
      </div>

      {/* Phases */}
      {visiblePhases.map((phase, i) => (
        <PhaseSection
          key={phase.id}
          phase={phase}
          checked={checked}
          onToggle={handleToggle}
          defaultOpen={i === 0}
        />
      ))}

      {/* Notes */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Notes
        </label>
        <textarea
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#266b75]/40 focus:border-[#266b75] transition-colors resize-none"
          rows={5}
          placeholder="Add any notes about this client's onboarding — next steps, blockers, reminders…"
          value={notes}
          onChange={e => handleNotesChange(e.target.value)}
        />
        <p className="text-xs text-slate-400 mt-1.5">Saves automatically as you type.</p>
      </div>

      {/* Reset */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        {!showResetConfirm ? (
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-red-600 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Checklist
          </button>
        ) : (
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">Reset this checklist?</p>
              <p className="text-xs text-slate-500 mt-0.5">All checked items and notes will be cleared. This cannot be undone.</p>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Yes, Reset
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

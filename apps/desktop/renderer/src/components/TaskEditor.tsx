import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarClock, Search, X } from "lucide-react";
import type { RecurrenceRule, Task, TaskType, TimePeriod } from "@shared/contracts";
import { dateInputValue, formatZoned, timeInputValue, zonedWallTimeToUtc } from "@/lib/datetime";

type Props = {
  open: boolean;
  task: Task | null;
  taskTypes: TaskType[];
  periods: TimePeriod[];
  defaultTimezone: string;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: { id?: string; title: string; content: string | null; priority: Task["priority"]; typeId: string | null; dueAtUtc: string | null; linkedPeriodIds: string[]; recurrenceRule: RecurrenceRule | null; recurrenceEditScope?: "this" | "following" | "series" }) => void;
  onDelete?: (id: string) => void;
};

export function TaskEditor({ open, task, taskTypes, periods, defaultTimezone, onOpenChange, onSave, onDelete }: Props) {
  const initial = useMemo(() => {
    const due = task?.dueAtUtc ? new Date(task.dueAtUtc) : null;
    return {
      title: task?.title ?? "",
      content: task?.content ?? "",
      priority: task?.priority ?? "none",
      typeId: task?.typeId ?? "",
      dueDate: due ? dateInputValue(due, defaultTimezone) : "",
      dueTime: due ? timeInputValue(due, defaultTimezone) : "",
      linkedPeriodIds: task?.linkedPeriodIds ?? [],
      recurrenceEditScope: "series" as "this" | "following" | "series"
    };
  }, [task, defaultTimezone]);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [periodQuery, setPeriodQuery] = useState("");
  const visiblePeriods = useMemo(() => {
    const normalized = periodQuery.trim().toLowerCase();
    const sorted = collapseLinkedPeriodOptions(periods).sort((a, b) => Date.parse(a.startAtUtc) - Date.parse(b.startAtUtc));
    if (!normalized) return sorted;
    return sorted.filter((period) => [period.title, period.description, period.notes, period.category].filter(Boolean).join(" ").toLowerCase().includes(normalized));
  }, [periodQuery, periods]);
  useEffect(() => {
    if (open) {
      setDraft(initial);
      setError("");
      setPeriodQuery("");
    }
  }, [open, initial]);

  function submit() {
    if (!draft.title.trim()) {
      setError("Title is required.");
      return;
    }
    const dueAtUtc = draft.dueDate ? zonedWallTimeToUtc(draft.dueDate, draft.dueTime || "09:00", defaultTimezone) : null;
    onSave({
      id: task?.id,
      title: draft.title.trim(),
      content: draft.content.trim() ? draft.content.trim() : null,
      priority: draft.priority,
      typeId: draft.typeId || null,
      dueAtUtc,
      linkedPeriodIds: draft.linkedPeriodIds,
      recurrenceRule: task?.recurrenceRule ?? null,
      recurrenceEditScope: draft.recurrenceEditScope
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed right-5 top-5 z-50 flex max-h-[calc(100vh-40px)] w-[420px] flex-col overflow-hidden rounded-[14px] border border-line bg-panel shadow-panel">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <Dialog.Title className="text-[17px] font-semibold">{task ? "Edit task" : "Add task"}</Dialog.Title>
            <Dialog.Close className="focus-ring rounded-[10px] p-2 hover:bg-surface"><X size={16} /></Dialog.Close>
          </div>
          <div className="space-y-4 overflow-auto p-5">
            <Field label="Title"><input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus /></Field>
            <Field label="Content"><textarea className="input min-h-20 resize-none" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="Add task notes, acceptance criteria, or context." /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Priority">
                <select className="input" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Task["priority"] })}>
                  {["urgent", "high", "medium", "low", "none"].map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Type">
                <select className="input" value={draft.typeId} onChange={(e) => setDraft({ ...draft, typeId: e.target.value })}>
                  <option value="">None</option>
                  {taskTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
              </Field>
              <Field label="Due date"><input className="input" type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} /></Field>
              <Field label="Due time"><input className="input" type="time" value={draft.dueTime} onChange={(e) => setDraft({ ...draft, dueTime: e.target.value })} /></Field>
            </div>
            <Field label="Linked periods">
              <div className="rounded-[12px] border border-line bg-surface p-2">
                <div className="mb-2 flex items-center gap-2 rounded-[10px] border border-line bg-panel px-3 py-2 text-muted">
                  <Search size={14} />
                  <input className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none" value={periodQuery} onChange={(event) => setPeriodQuery(event.target.value)} placeholder="Search periods by title, content, category" />
                </div>
                <div className="scroll-smooth-ui max-h-64 space-y-2 overflow-auto pr-1">
                  {visiblePeriods.map((period) => {
                    const linkID = basePeriodID(period.id);
                    const checked = draft.linkedPeriodIds.includes(linkID);
                    return (
                      <button
                        key={period.id}
                        type="button"
                        className={`focus-ring w-full rounded-[10px] border p-2 text-left transition hover:bg-panel ${checked ? "border-accent bg-accent/10" : "border-line bg-panel/60"}`}
                        style={{ borderLeft: `4px solid ${period.color}` }}
                        onClick={() => setDraft({
                          ...draft,
                          linkedPeriodIds: checked ? draft.linkedPeriodIds.filter((id) => id !== linkID) : [...draft.linkedPeriodIds, linkID]
                        })}
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <CalendarClock size={15} className="mt-0.5 shrink-0 text-accent" />
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-[13px] font-semibold text-ink">{period.title}</span>
                              <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted">{period.category}</span>
                              {period.recurrenceRule && <span className="shrink-0 rounded bg-current/10 px-1.5 py-0.5 text-[10px] text-current">repeat</span>}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted">{formatZoned(period.startAtUtc, defaultTimezone, "MMM d, h:mm a")} - {formatZoned(period.endAtUtc, defaultTimezone, "h:mm a")}</div>
                            <div className="mt-1 line-clamp-2 text-[12px] leading-4 text-muted">{period.description || period.notes || "No details added yet."}</div>
                          </div>
                          <span className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${checked ? "border-accent bg-accent shadow-[inset_0_0_0_3px_hsl(var(--surface))]" : "border-line bg-surface"}`} />
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!periods.length && <div className="p-2 text-[13px] text-muted">No periods yet.</div>}
                {periods.length > 0 && !visiblePeriods.length && <div className="p-2 text-[13px] text-muted">No periods match your search.</div>}
              </div>
            </Field>
            {error && <div className="rounded-[10px] border border-urgent/30 bg-urgent/10 px-3 py-2 text-[13px] text-urgent">{error}</div>}
          </div>
          <div className="flex items-center justify-between border-t border-line px-5 py-4">
            {task && onDelete ? <button className="rounded-[10px] px-3 py-2 text-[13px] text-urgent hover:bg-urgent/10" onClick={() => onDelete(task.id)}>Delete</button> : <span />}
            <div className="flex gap-2">
              <Dialog.Close className="rounded-[10px] border border-line px-3 py-2 hover:bg-surface">Cancel</Dialog.Close>
              <button className="rounded-[10px] bg-ink px-3 py-2 text-white" onClick={submit}>Save</button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-[13px] font-medium text-muted"><span className="mb-1 block">{label}</span>{children}</label>;
}

function basePeriodID(id: string) {
  return id.split("#occ#")[0];
}

function collapseLinkedPeriodOptions(periods: TimePeriod[]) {
  const grouped = new Map<string, TimePeriod>();
  for (const period of periods) {
    const id = basePeriodID(period.id);
    const existing = grouped.get(id);
    if (!existing) {
      grouped.set(id, period);
      continue;
    }
    const periodHasRule = Boolean(period.recurrenceRule);
    const existingHasRule = Boolean(existing.recurrenceRule);
    if ((periodHasRule && !existingHasRule) || (!period.id.includes("#occ#") && existing.id.includes("#occ#")) || Date.parse(period.startAtUtc) < Date.parse(existing.startAtUtc)) {
      grouped.set(id, {
        ...period,
        recurrenceRule: period.recurrenceRule ?? existing.recurrenceRule
      });
    } else if (!existing.recurrenceRule && period.recurrenceRule) {
      grouped.set(id, { ...existing, recurrenceRule: period.recurrenceRule });
    }
  }
  return [...grouped.values()];
}

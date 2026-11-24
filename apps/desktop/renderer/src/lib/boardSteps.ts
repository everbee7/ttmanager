import { DEFAULT_BOARD_STEPS, type BoardStep, type Task } from "@shared/contracts";

export type DayBounds = { now: number; todayStart: number; tomorrowStart: number };

export const STEP_COLORS = ["#dd2c22", "#ff8c00", "#ffc61a", "#22c55e", "#14b8a6", "#38bdf8", "#2563eb", "#7c3aed", "#db2777", "#9aa1b9"];

export const SMART_STEP_INFO: Record<string, string> = {
  overdue: "Auto: due date has passed",
  today: "Auto: due today or urgent",
  planned: "Auto: has a due date or linked period",
  inbox: "Auto: open tasks with no schedule",
  done: "Auto: completed tasks"
};

export function visibleSteps(steps: BoardStep[]) {
  const list = steps.length ? steps : DEFAULT_BOARD_STEPS;
  const shown = list.filter((step) => !step.hidden);
  return shown.length ? shown : list.slice(0, 1);
}

/** Built-in columns that were deleted and can be restored. */
export function missingSmartSteps(steps: BoardStep[]) {
  const present = new Set(steps.map((step) => step.id));
  return DEFAULT_BOARD_STEPS.filter((step) => !present.has(step.id));
}

/**
 * Column a task falls into using only the automatic rules, honouring which
 * built-in columns currently exist. Missing ones pass their tasks on to the next
 * applicable rule (an overdue task goes to Today, etc.); null means no rule fits.
 */
export function smartStepFor(task: Task, visible: Set<string>, bounds: DayBounds): string | null {
  if (task.status === "completed") return visible.has("done") ? "done" : null;
  const due = task.dueAtUtc ? Date.parse(task.dueAtUtc) : null;
  const overdue = due !== null && due < bounds.now;
  if (overdue && visible.has("overdue")) return "overdue";
  const dueToday = due !== null && due >= bounds.todayStart && due < bounds.tomorrowStart;
  if (visible.has("today") && (overdue || task.priority === "urgent" || dueToday)) return "today";
  if (visible.has("planned") && (due !== null || task.linkedPeriodIds.length > 0)) return "planned";
  if (visible.has("inbox")) return "inbox";
  return null;
}

/**
 * Column a task is shown in. Completed tasks prefer Done; otherwise a task
 * placed in a custom column stays there; then the automatic rules; and finally
 * the first column (skipping Done for open tasks).
 */
export function stepForTask(task: Task, steps: BoardStep[], bounds: DayBounds): string {
  const shown = visibleSteps(steps);
  const visible = new Set(shown.map((step) => step.id));
  const inCustom = Boolean(task.stepId && shown.some((step) => step.id === task.stepId && step.kind === "custom"));
  if (task.status === "completed" && visible.has("done")) return "done";
  if (inCustom) return task.stepId as string;
  const smart = smartStepFor(task, visible, bounds);
  if (smart) return smart;
  const fallback = task.status === "completed" ? shown[shown.length - 1] : shown.find((step) => step.id !== "done") ?? shown[0];
  return fallback.id;
}

export function newStepID() {
  return `step-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createCustomStep(label: string, existing: BoardStep[]): BoardStep {
  const used = new Set(existing.map((step) => step.color));
  const color = STEP_COLORS.find((value) => !used.has(value)) ?? STEP_COLORS[existing.length % STEP_COLORS.length];
  return { id: newStepID(), label: label.trim() || "New column", hint: "", color, kind: "custom", hidden: false };
}

/** Insert a step right after another one (or at the end). */
export function insertStepAfter(steps: BoardStep[], afterID: string, step: BoardStep): BoardStep[] {
  const index = steps.findIndex((item) => item.id === afterID);
  if (index === -1) return [...steps, step];
  return [...steps.slice(0, index + 1), step, ...steps.slice(index + 1)];
}

/** Swap a step with its visible neighbour on the board. */
export function shiftStep(steps: BoardStep[], stepID: string, direction: -1 | 1): BoardStep[] {
  const shown = visibleSteps(steps);
  const position = shown.findIndex((step) => step.id === stepID);
  const neighbour = shown[position + direction];
  if (position === -1 || !neighbour) return steps;
  const a = steps.findIndex((step) => step.id === stepID);
  const b = steps.findIndex((step) => step.id === neighbour.id);
  const next = [...steps];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/** Insert a custom step before "done" so completed work stays last by default. */
export function insertStep(steps: BoardStep[], step: BoardStep): BoardStep[] {
  const doneIndex = steps.findIndex((item) => item.id === "done");
  if (doneIndex === -1) return [...steps, step];
  return [...steps.slice(0, doneIndex), step, ...steps.slice(doneIndex)];
}

export function moveStep(steps: BoardStep[], stepID: string, targetIndex: number): BoardStep[] {
  const from = steps.findIndex((step) => step.id === stepID);
  if (from === -1) return steps;
  const next = [...steps];
  const [item] = next.splice(from, 1);
  const to = Math.max(0, Math.min(from < targetIndex ? targetIndex - 1 : targetIndex, next.length));
  next.splice(to, 0, item);
  return next;
}

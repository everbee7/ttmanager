import { describe, expect, it } from "vitest";
import { DEFAULT_BOARD_STEPS, type BoardStep, type Task } from "@shared/contracts";
import { createCustomStep, insertStep, insertStepAfter, moveStep, shiftStep, stepForTask, visibleSteps } from "./boardSteps";

const now = Date.parse("2026-11-24T15:00:00Z");
const bounds = { now, todayStart: Date.parse("2026-11-24T07:00:00Z"), tomorrowStart: Date.parse("2026-11-25T07:00:00Z") };

function task(patch: Partial<Task> = {}): Task {
  return { id: "t1", title: "Task", content: null, priority: "none", typeId: null, dueAtUtc: null, status: "open", stepId: null, linkedPeriodIds: [], recurrenceRule: null, createdAtUtc: "2026-11-01T00:00:00Z", updatedAtUtc: "2026-11-01T00:00:00Z", ...patch };
}

const review: BoardStep = { id: "step-review", label: "Review", hint: "", color: "#7c3aed", kind: "custom", hidden: false };
const withReview = insertStep(DEFAULT_BOARD_STEPS, review);

describe("board steps", () => {
  it("classifies with the default smart steps", () => {
    expect(stepForTask(task(), DEFAULT_BOARD_STEPS, bounds)).toBe("inbox");
    expect(stepForTask(task({ dueAtUtc: "2026-11-24T10:00:00Z" }), DEFAULT_BOARD_STEPS, bounds)).toBe("overdue");
    expect(stepForTask(task({ dueAtUtc: "2026-11-24T20:00:00Z" }), DEFAULT_BOARD_STEPS, bounds)).toBe("today");
    expect(stepForTask(task({ dueAtUtc: "2026-11-26T20:00:00Z" }), DEFAULT_BOARD_STEPS, bounds)).toBe("planned");
    expect(stepForTask(task({ status: "completed" }), DEFAULT_BOARD_STEPS, bounds)).toBe("done");
  });

  it("places tasks in custom steps and falls back when the step is hidden or gone", () => {
    expect(stepForTask(task({ stepId: "step-review" }), withReview, bounds)).toBe("step-review");
    expect(stepForTask(task({ stepId: "step-review", status: "completed" }), withReview, bounds)).toBe("done");
    const hidden = withReview.map((step) => step.id === "step-review" ? { ...step, hidden: true } : step);
    expect(stepForTask(task({ stepId: "step-review" }), hidden, bounds)).toBe("inbox");
    expect(stepForTask(task({ stepId: "missing" }), DEFAULT_BOARD_STEPS, bounds)).toBe("inbox");
  });

  it("passes tasks on when smart steps are hidden", () => {
    const noOverdue = DEFAULT_BOARD_STEPS.map((step) => step.id === "overdue" ? { ...step, hidden: true } : step);
    expect(stepForTask(task({ dueAtUtc: "2026-11-24T10:00:00Z" }), noOverdue, bounds)).toBe("today");
    const allHidden = DEFAULT_BOARD_STEPS.map((step) => ({ ...step, hidden: true }));
    expect(visibleSteps(allHidden).map((step) => step.id)).toEqual(["overdue"]);
  });

  it("handles deleted built-in columns like a plain kanban board", () => {
    const kanban: BoardStep[] = [
      { id: "todo", label: "To do", hint: "", color: "#9aa1b9", kind: "custom", hidden: false },
      review,
      { id: "shipped", label: "Shipped", hint: "", color: "#22c55e", kind: "custom", hidden: false }
    ];
    expect(stepForTask(task(), kanban, bounds)).toBe("todo");
    expect(stepForTask(task({ dueAtUtc: "2026-11-24T10:00:00Z" }), kanban, bounds)).toBe("todo");
    expect(stepForTask(task({ stepId: "step-review" }), kanban, bounds)).toBe("step-review");
    expect(stepForTask(task({ stepId: "step-review", status: "completed" }), kanban, bounds)).toBe("step-review");
    expect(stepForTask(task({ status: "completed" }), kanban, bounds)).toBe("shipped");
    const noInbox = DEFAULT_BOARD_STEPS.filter((step) => step.id !== "inbox");
    expect(stepForTask(task(), noInbox, bounds)).toBe("overdue");
  });

  it("shifts columns among visible neighbours", () => {
    const hiddenToday = DEFAULT_BOARD_STEPS.map((step) => step.id === "today" ? { ...step, hidden: true } : step);
    expect(shiftStep(hiddenToday, "planned", -1).map((step) => step.id)).toEqual(["planned", "today", "overdue", "inbox", "done"]);
    expect(shiftStep(DEFAULT_BOARD_STEPS, "done", 1)).toBe(DEFAULT_BOARD_STEPS);
    const added = insertStepAfter(DEFAULT_BOARD_STEPS, "today", review).map((step) => step.id);
    expect(added.indexOf("step-review")).toBe(2);
  });

  it("inserts new steps before Done and reorders", () => {
    const step = createCustomStep("  QA ", DEFAULT_BOARD_STEPS);
    expect(step.label).toBe("QA");
    const ids = insertStep(DEFAULT_BOARD_STEPS, step).map((item) => item.id);
    expect(ids.indexOf(step.id)).toBe(ids.indexOf("done") - 1);
    expect(moveStep(DEFAULT_BOARD_STEPS, "done", 0).map((item) => item.id)).toEqual(["done", "overdue", "today", "planned", "inbox"]);
    expect(moveStep(DEFAULT_BOARD_STEPS, "overdue", 5).map((item) => item.id)).toEqual(["today", "planned", "inbox", "done", "overdue"]);
  });
});

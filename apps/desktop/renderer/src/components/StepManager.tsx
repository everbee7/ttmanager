import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DEFAULT_BOARD_STEPS, type BoardStep } from "@shared/contracts";
import { createCustomStep, insertStep, missingSmartSteps } from "@/lib/boardSteps";

type Props = {
  open: boolean;
  steps: BoardStep[];
  taskCounts: Record<string, number>;
  saving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (steps: BoardStep[]) => void;
};

export function StepManager({ open, steps, taskCounts, saving, error, onOpenChange, onSave }: Props) {
  const [draft, setDraft] = useState<BoardStep[]>(steps);
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(steps);
      setNewLabel("");
    }
  }, [open, steps]);

  const update = (id: string, patch: Partial<BoardStep>) => setDraft((current) => current.map((step) => step.id === id ? { ...step, ...patch } : step));
  const shift = (index: number, delta: number) => setDraft((current) => {
    const target = index + delta;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const addStep = () => {
    if (!newLabel.trim()) return;
    setDraft((current) => insertStep(current, createCustomStep(newLabel, current)));
    setNewLabel("");
  };
  const visibleCount = draft.filter((step) => !step.hidden).length;
  const invalid = draft.some((step) => !step.label.trim()) || visibleCount === 0;
  const missing = missingSmartSteps(draft);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-60px)] w-[640px] max-w-[calc(100vw-40px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[14px] border border-line bg-panel shadow-panel">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="text-[17px] font-semibold">Board columns</Dialog.Title>
              <Dialog.Description className="text-[12px] text-muted">Create, rename, recolor, reorder, hide or delete any column. Deleting a column never deletes its tasks.</Dialog.Description>
            </div>
            <Dialog.Close className="focus-ring rounded-[10px] p-2 hover:bg-surface" aria-label="Close"><X size={16} /></Dialog.Close>
          </div>
          <div className="scroll-smooth-ui flex-1 space-y-2 overflow-auto p-5">
            {draft.map((step, index) => {
              const lastVisible = !step.hidden && visibleCount === 1;
              const count = taskCounts[step.id] ?? 0;
              return (
                <div key={step.id} className={`flex items-center gap-2 rounded-[10px] border border-line bg-surface p-2 ${step.hidden ? "opacity-55" : ""}`}>
                  <div className="flex flex-col">
                    <button className="focus-ring rounded p-0.5 text-muted hover:text-ink disabled:opacity-30" disabled={index === 0} onClick={() => shift(index, -1)} aria-label={`Move ${step.label} up`}><ArrowUp size={14} /></button>
                    <button className="focus-ring rounded p-0.5 text-muted hover:text-ink disabled:opacity-30" disabled={index === draft.length - 1} onClick={() => shift(index, 1)} aria-label={`Move ${step.label} down`}><ArrowDown size={14} /></button>
                  </div>
                  <input type="color" className="h-8 w-8 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0.5" value={step.color} onChange={(event) => update(step.id, { color: event.target.value })} aria-label={`${step.label} color`} />
                  <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-2">
                    <input className="input" value={step.label} maxLength={60} onChange={(event) => update(step.id, { label: event.target.value })} placeholder="Column name" aria-label="Column name" />
                    <input className="input" value={step.hint} maxLength={120} onChange={(event) => update(step.id, { hint: event.target.value })} placeholder="Short description" aria-label="Column description" />
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[11px] ${step.kind === "smart" ? "bg-accent/10 text-accent" : "bg-panel text-muted"}`} title={step.kind === "smart" ? "Tasks are sorted here automatically by due date and status" : "Tasks are placed here by moving them"}>
                    {step.kind === "smart" ? <><Sparkles size={11} /> Auto</> : `${count} task${count === 1 ? "" : "s"}`}
                  </span>
                  <button className="focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-muted hover:bg-panel hover:text-ink disabled:opacity-30" disabled={lastVisible} onClick={() => update(step.id, { hidden: !step.hidden })} title={lastVisible ? "The board needs at least one column" : step.hidden ? "Show column" : "Hide column"} aria-label={step.hidden ? `Show ${step.label}` : `Hide ${step.label}`}>
                    {step.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <button className="focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-muted hover:bg-urgent/10 hover:text-urgent disabled:opacity-30" disabled={lastVisible || draft.length === 1} onClick={() => setDraft((current) => current.filter((item) => item.id !== step.id))} title={lastVisible || draft.length === 1 ? "The board needs at least one column" : step.kind === "custom" && count ? `Delete column (its ${count} task${count === 1 ? "" : "s"} move to the remaining columns)` : "Delete column"} aria-label={`Delete ${step.label}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
            <form className="flex gap-2 pt-2" onSubmit={(event) => { event.preventDefault(); addStep(); }}>
              <input className="input" value={newLabel} maxLength={60} onChange={(event) => setNewLabel(event.target.value)} placeholder="New column name, e.g. In review" aria-label="New column name" />
              <button type="submit" className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-[10px] border border-line px-3 py-2 hover:bg-surface disabled:opacity-50" disabled={!newLabel.trim()}><Plus size={15} /> Add column</button>
            </form>
            {!!missing.length && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[12px] text-muted">
                <span>Restore automatic column:</span>
                {missing.map((step) => (
                  <button key={step.id} className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 hover:bg-surface hover:text-ink" onClick={() => setDraft((current) => step.id === "done" ? [...current, step] : insertStep(current, step))}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: step.color }} /> {step.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
            <button className="focus-ring inline-flex items-center gap-2 rounded-[10px] px-3 py-2 text-muted hover:bg-surface hover:text-ink" onClick={() => setDraft(DEFAULT_BOARD_STEPS)}><RotateCcw size={14} /> Reset to defaults</button>
            <div className="flex items-center gap-2">
              {error && <span className="text-[12px] text-urgent">{error}</span>}
              <Dialog.Close className="focus-ring rounded-[10px] px-3 py-2 hover:bg-surface">Cancel</Dialog.Close>
              <button className="focus-ring rounded-[10px] bg-accent px-3 py-2 font-semibold text-surface disabled:opacity-50" disabled={saving || invalid} onClick={() => onSave(draft.map((step) => ({ ...step, label: step.label.trim(), hint: step.hint.trim() })))}>{saving ? "Saving..." : "Save columns"}</button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

import * as Popover from "@radix-ui/react-popover";
import { ArrowLeft, ArrowRight, Check, Columns3, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { STEP_COLORS } from "@/lib/boardSteps";

type Props = {
  label: string;
  color: string;
  taskCount: number;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canDelete: boolean;
  onRename: () => void;
  onColor: (color: string) => void;
  onMove: (direction: -1 | 1) => void;
  onAddAfter: () => void;
  onDelete: () => void;
};

const item = "focus-ring flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] hover:bg-surface disabled:pointer-events-none disabled:opacity-40";

export function ColumnMenu({ label, color, taskCount, canMoveLeft, canMoveRight, canDelete, onRename, onColor, onMove, onAddAfter, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <Popover.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) setConfirming(false); }}>
      <Popover.Trigger asChild>
        <button className="focus-ring inline-flex h-6 w-6 items-center justify-center rounded-[6px] text-muted hover:bg-panel hover:text-ink" aria-label={`${label} column options`} title="Column options" onPointerDown={(event) => event.stopPropagation()}>
          <MoreHorizontal size={15} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-[220px] rounded-[12px] border border-line bg-panel p-1.5 shadow-panel">
          {confirming ? (
            <div className="p-2">
              <p className="text-[13px] font-medium">Delete "{label}"?</p>
              <p className="mt-1 text-[12px] text-muted">
                {taskCount ? `Its ${taskCount} task${taskCount === 1 ? "" : "s"} will move to the remaining columns. No tasks are deleted.` : "This column is empty."}
              </p>
              <div className="mt-3 flex gap-2">
                <button className="focus-ring rounded-[8px] bg-urgent px-3 py-1.5 text-[13px] font-semibold text-white" onClick={run(onDelete)}>Delete</button>
                <button className="focus-ring rounded-[8px] px-3 py-1.5 text-[13px] hover:bg-surface" onClick={() => setConfirming(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <button className={item} onClick={run(onRename)}><Pencil size={14} /> Rename</button>
              <div className="flex flex-wrap gap-1.5 px-2 py-2" role="group" aria-label="Column color">
                {STEP_COLORS.map((swatch) => (
                  <button key={swatch} className="focus-ring inline-flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: swatch }} onClick={() => onColor(swatch)} aria-label={`Color ${swatch}`}>
                    {swatch.toLowerCase() === color.toLowerCase() && <Check size={12} className="text-white drop-shadow" />}
                  </button>
                ))}
              </div>
              <div className="my-1 border-t border-line" />
              <button className={item} disabled={!canMoveLeft} onClick={run(() => onMove(-1))}><ArrowLeft size={14} /> Move left</button>
              <button className={item} disabled={!canMoveRight} onClick={run(() => onMove(1))}><ArrowRight size={14} /> Move right</button>
              <button className={item} onClick={run(onAddAfter)}><Columns3 size={14} /> Add column to the right</button>
              <div className="my-1 border-t border-line" />
              <button className={`${item} text-urgent hover:bg-urgent/10`} disabled={!canDelete} title={canDelete ? undefined : "The board needs at least one column"} onClick={() => setConfirming(true)}><Trash2 size={14} /> Delete column</button>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

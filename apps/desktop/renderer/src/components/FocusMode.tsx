import * as Dialog from "@radix-ui/react-dialog";
import { Pause, Play, Square, TimerReset, X } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  title: string;
  minutes: number;
  endAtUtc?: string | null;
  onOpenChange: (open: boolean) => void;
};

export function FocusMode({ open, title, minutes, endAtUtc, onOpenChange }: Props) {
  const initialSeconds = () => endAtUtc ? Math.max(0, Math.ceil((Date.parse(endAtUtc) - Date.now()) / 1000)) : minutes * 60;
  const [remaining, setRemaining] = useState(initialSeconds);
  const [running, setRunning] = useState(true);
  useEffect(() => {
    if (open) {
      setRemaining(initialSeconds());
      setRunning(true);
    }
  }, [open, minutes, endAtUtc]);
  useEffect(() => {
    if (!running || !open) return;
    const id = window.setInterval(() => {
      setRemaining((value) => endAtUtc ? Math.max(0, Math.ceil((Date.parse(endAtUtc) - Date.now()) / 1000)) : Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, open, endAtUtc]);
  const hh = Math.floor(remaining / 3600).toString().padStart(2, "0");
  const mm = Math.floor((remaining % 3600) / 60).toString().padStart(2, "0");
  const ss = (remaining % 60).toString().padStart(2, "0");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-[14px] border border-line bg-panel p-5 shadow-panel">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-[18px] font-semibold">Focus mode</Dialog.Title>
            <Dialog.Close className="focus-ring rounded-[10px] p-2 hover:bg-surface"><X size={16} /></Dialog.Close>
          </div>
          <div className="py-10 text-center">
            <div className="text-[13px] uppercase text-muted">Current focus</div>
            <div className="mt-2 text-[24px] font-semibold">{title}</div>
            <div className="mt-6 text-[64px] font-semibold tabular-nums">{hh}:{mm}:{ss}</div>
          </div>
          <div className="flex justify-center gap-2">
            <button className="rounded-[12px] border border-line p-3 hover:bg-surface" onClick={() => setRunning((v) => !v)}>{running ? <Pause size={18} /> : <Play size={18} />}</button>
            <button className="rounded-[12px] border border-line p-3 hover:bg-surface" onClick={() => setRemaining((v) => v + 15 * 60)}><TimerReset size={18} /></button>
            <button className="rounded-[12px] bg-ink p-3 text-white" onClick={() => onOpenChange(false)}><Square size={18} /></button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

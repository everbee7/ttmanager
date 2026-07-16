import * as Dialog from "@radix-ui/react-dialog";
import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type Command = { label: string; hint: string; run: () => void };

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const commands = useMemo<Command[]>(() => [
    { label: "Add task", hint: "Create a new task", run: () => navigate("/tasks?add=task") },
    { label: "Add time period", hint: "Create a new timeline block", run: () => navigate("/timeline?add=period") },
    { label: "Go to Today", hint: "Open dashboard", run: () => navigate("/") },
    { label: "Go to Timeline", hint: "Open day planner", run: () => navigate("/timeline") },
    { label: "Go to Tasks", hint: "Open task manager", run: () => navigate("/tasks") },
    { label: "Open Reports", hint: "Review productivity", run: () => navigate("/reports") },
    { label: "Open Settings", hint: "Configure the app", run: () => navigate("/settings") }
  ], [navigate]);
  const visible = query ? new Fuse(commands, { keys: ["label", "hint"], threshold: 0.35 }).search(query).map((r) => r.item) : commands;
  function run(command: Command) {
    command.run();
    onOpenChange(false);
    setQuery("");
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
        <Dialog.Content className="fixed left-1/2 top-24 z-50 w-[560px] -translate-x-1/2 overflow-hidden rounded-[14px] border border-line bg-panel shadow-panel">
          <input className="w-full border-b border-line bg-transparent px-4 py-4 text-[15px] outline-none" placeholder="Type a command..." value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <div className="max-h-80 overflow-auto p-2">
            {visible.map((command) => (
              <button key={command.label} className="block w-full rounded-[10px] px-3 py-2 text-left hover:bg-surface" onClick={() => run(command)}>
                <div className="font-medium">{command.label}</div>
                <div className="text-[12px] text-muted">{command.hint}</div>
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

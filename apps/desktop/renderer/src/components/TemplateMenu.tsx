import * as Popover from "@radix-ui/react-popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { applyTemplate, listTemplates, saveTemplate } from "@/lib/api";

export function TemplateMenu() {
  const qc = useQueryClient();
  const [name, setName] = useState("Daily routine");
  const [open, setOpen] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");
  const templates = useQuery({ queryKey: ["templates"], queryFn: listTemplates, enabled: open });
  const save = useMutation({ mutationFn: () => saveTemplate(name, today), onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }) });
  const apply = useMutation({ mutationFn: (id: string) => applyTemplate(id, today), onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshot"] }) });
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="rounded-[10px] border border-line px-3 py-2 text-[13px] hover:bg-panel">Daily template</Popover.Trigger>
      <Popover.Content className="z-50 w-80 rounded-[14px] border border-line bg-panel p-3 shadow-panel" align="end">
        <div className="mb-3 text-[14px] font-semibold">Daily templates</div>
        <div className="flex gap-2">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="rounded-[10px] bg-ink px-3 py-2 text-white" onClick={() => save.mutate()}>Save</button>
        </div>
        <div className="mt-3 max-h-56 space-y-1 overflow-auto">
          {(templates.data ?? []).map((template) => (
            <button key={template.id} className="block w-full rounded-[10px] px-3 py-2 text-left hover:bg-surface" onClick={() => apply.mutate(template.id)}>
              <div className="font-medium">{template.name}</div>
              <div className="text-[12px] text-muted">{template.periodCount} periods</div>
            </button>
          ))}
          {templates.data?.length === 0 && <div className="p-2 text-[13px] text-muted">No templates saved.</div>}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

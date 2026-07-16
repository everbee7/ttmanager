import { useQuery } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, addMinutes, differenceInMinutes, format } from "date-fns";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Edit3, Plus, Repeat2, Trash2, X } from "lucide-react";
import { createPeriod, deletePeriod, getSnapshot, updatePeriod, updateTask } from "@/lib/api";
import { PeriodEditor } from "@/components/PeriodEditor";
import type { Snapshot, Task, TimePeriod } from "@shared/contracts";
import { useSearchParams } from "react-router-dom";
import { formatZoned, sameZonedDay, zonedHourPosition, zonedNow } from "@/lib/datetime";

const hourHeight = 72;
type PeriodSavePayload = { id?: string; title: string; description: string | null; startAtUtc: string; endAtUtc: string; sourceTimezone: string; category: string; color: string; notes: string | null; recurrenceRule: TimePeriod["recurrenceRule"]; recurrenceEditScope?: "this" | "following" | "series" };
type PeriodMovePayload = { id: string; startAtUtc: string; endAtUtc: string; recurrenceEditScope?: "this" | "following" | "series" };
const snapMinutes = 15;

export function TimelinePage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState<TimePeriod | null>(null);
  const [selected, setSelected] = useState<TimePeriod | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TimePeriod | null>(null);
  const [pendingMove, setPendingMove] = useState<{ period: TimePeriod; payload: PeriodMovePayload } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(new Date());
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const { data } = useQuery({ queryKey: ["snapshot"], queryFn: getSnapshot });
  const save = useMutation({
    mutationFn: (payload: PeriodSavePayload) => payload.id ? updatePeriod({ ...payload, id: payload.id }) : createPeriod(payload),
    onSuccess: async () => {
      setEditorOpen(false);
      setEditing(null);
      setSelected(null);
      await queryClient.refetchQueries({ queryKey: ["snapshot"] });
    }
  });
  const remove = useMutation({
    mutationFn: ({ id, scope }: { id: string; scope?: "this" | "following" | "series" }) => deletePeriod(id, scope),
    onMutate: async ({ id, scope }) => {
      await queryClient.cancelQueries({ queryKey: ["snapshot"] });
      setEditorOpen(false);
      setEditing(null);
      setSelected(null);
      setPendingDelete(null);
      const baseID = basePeriodID(id);
      const previous = queryClient.getQueryData<Snapshot>(["snapshot"]);
      const cutoff = previous?.periods.find((item) => item.id === id)?.startAtUtc ?? "";
      queryClient.setQueryData<Snapshot>(["snapshot"], (current) => current ? {
        ...current,
        periods: current.periods.filter((period) => {
          if (scope === "series") return basePeriodID(period.id) !== baseID;
          if (scope === "following" && cutoff && basePeriodID(period.id) === baseID) return Date.parse(period.startAtUtc) < Date.parse(cutoff);
          return period.id !== id;
        })
      } : current);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(["snapshot"], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["snapshot"] });
    }
  });
  const unlinkTask = useMutation({
    mutationFn: ({ task, periodID }: { task: Task; periodID: string }) => updateTask({
      id: task.id,
      title: task.title,
      content: task.content,
      priority: task.priority,
      typeId: task.typeId,
      dueAtUtc: task.dueAtUtc,
      linkedPeriodIds: task.linkedPeriodIds.filter((id) => id !== periodID),
      recurrenceRule: task.recurrenceRule,
      recurrenceEditScope: "series"
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["snapshot"] })
  });
  useEffect(() => {
    if (searchParams.get("add") === "period") {
      setEditing(null);
      setEditorOpen(true);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const rawPeriods = data?.periods ?? [];
  const allPeriods = useMemo(() => rawPeriods.map((period) => hydrateSeriesPeriod(period, rawPeriods)), [rawPeriods]);
  const displayTimezone = data?.settings.defaultTimezone ?? "America/Denver";
  const tasks = data?.tasks ?? [];
  const periods = allPeriods.filter((period) => sameZonedDay(period.startAtUtc, selectedDay, displayTimezone) || sameZonedDay(period.endAtUtc, selectedDay, displayTimezone));
  const selectedPeriod = selected ? allPeriods.find((period) => period.id === selected.id) ?? null : null;
  const periodLayouts = useMemo(() => layoutOverlappingPeriods(periods), [periods]);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const firstPeriodTop = periods.length
      ? Math.max(0, Math.min(...periods.map((period) => periodTopForDay(period, displayTimezone))) - 96)
      : 0;
    const nowTop = sameZonedDay(new Date(), selectedDay, displayTimezone) ? zonedHourPosition(new Date(), displayTimezone) * hourHeight - 160 : firstPeriodTop;
    scroller.scrollTo({ top: Math.max(0, periods.length ? Math.min(firstPeriodTop, Math.max(0, nowTop)) : nowTop), behavior: "smooth" });
  }, [periods.length, selectedDay, displayTimezone]);
  useEffect(() => {
    if (selected && !allPeriods.some((period) => period.id === selected.id)) setSelected(null);
  }, [allPeriods, selected]);
  return (
    <div className="flex h-full flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold">Timeline</h1>
          <p className="text-[13px] text-muted">Drag, resize, duplicate, and link tasks to focused time blocks.</p>
        </div>
        <div className="flex items-center gap-2">
          <ToolbarIcon onClick={() => setSelectedDay((day) => addDays(day, -1))}><ChevronLeft size={16} /></ToolbarIcon>
          <div className="rounded-[10px] border border-line bg-panel px-3 py-2 text-[13px] font-medium">{format(selectedDay, "EEE, MMM d")}</div>
          <button className="focus-ring rounded-[10px] bg-accent px-3 py-2 text-[13px] font-semibold text-surface hover:bg-accent/90" onClick={() => setSelectedDay(zonedNow(displayTimezone))}>Today</button>
          <ToolbarIcon onClick={() => setSelectedDay((day) => addDays(day, 1))}><ChevronRight size={16} /></ToolbarIcon>
          <button className="inline-flex items-center gap-2 rounded-[10px] bg-ink px-3 py-2 text-white" onClick={() => { setEditing(null); setEditorOpen(true); }}><Plus size={16} /> Add period</button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] gap-4">
        <div ref={scrollerRef} className="scroll-smooth-ui relative min-h-0 overflow-auto rounded-[14px] border border-line bg-panel shadow-panel">
          <div className="relative ml-20" style={{ height: hourHeight * 24 }}>
            {hours.map((h) => (
              <div key={h} className="absolute left-0 right-0 border-t border-line" style={{ top: h * hourHeight }}>
                <span className="absolute -left-16 -top-2 text-[12px] text-muted">{format(new Date(2026, 0, 1, h), "h a")}</span>
                <div className="mt-9 border-t border-line/50" />
              </div>
            ))}
            <div className="absolute left-0 right-0 z-20 border-t-2 border-current" style={{ top: zonedHourPosition(new Date(), displayTimezone) * hourHeight }}>
              <span className="absolute -left-20 -top-3 rounded bg-current px-2 py-0.5 text-[11px] text-white">Now</span>
            </div>
            {periods.length === 0 && (
              <div className="absolute left-4 right-6 top-8 z-10 rounded-[12px] border border-dashed border-line bg-surface/80 p-5 text-[13px] text-muted">
                <div className="text-[15px] font-semibold text-ink">No time periods on this day</div>
                <div className="mt-1">Use Add period, switch back to Today, or check the selected date.</div>
              </div>
            )}
            {periods.map((p) => <PeriodBlock key={p.id} period={p} layout={periodLayouts[p.id] ?? { lane: 0, lanes: 1 }} periods={periods} selected={selectedPeriod?.id === p.id} selectedDay={selectedDay} timezone={displayTimezone} onSelect={() => setSelected(p)} onEdit={() => { setEditing(hydrateSeriesPeriod(p, allPeriods)); setEditorOpen(true); }} onDuplicate={() => save.mutate({ title: `${p.title} copy`, description: p.description, startAtUtc: p.startAtUtc, endAtUtc: p.endAtUtc, sourceTimezone: p.sourceTimezone, category: p.category, color: p.color, notes: p.notes, recurrenceRule: p.recurrenceRule })} onDelete={() => setPendingDelete(hydrateSeriesPeriod(p, allPeriods))} onMove={(payload) => {
              const hydrated = hydrateSeriesPeriod(p, allPeriods);
              if (hydrated.recurrenceRule) setPendingMove({ period: hydrated, payload });
              else void updatePeriod(payload).then(() => queryClient.invalidateQueries({ queryKey: ["snapshot"] }));
            }} />)}
          </div>
        </div>
        <div className="min-h-0">
          <PeriodDetail period={hydrateNullablePeriod(selectedPeriod ?? periods[0] ?? null, allPeriods)} allPeriods={allPeriods} tasks={tasks} timezone={displayTimezone} onUnlinkTask={(task, periodID) => unlinkTask.mutate({ task, periodID })} onEdit={(period) => { setEditing(hydrateSeriesPeriod(period, allPeriods)); setEditorOpen(true); }} onDelete={(period) => setPendingDelete(hydrateSeriesPeriod(period, allPeriods))} />
        </div>
      </div>
      <PeriodEditor open={editorOpen} period={editing} defaultTimezone={data?.settings.defaultTimezone ?? "America/Denver"} onOpenChange={setEditorOpen} onSave={(payload) => save.mutate(payload)} onDelete={(id, scope) => remove.mutate({ id, scope })} />
      <DeletePeriodDialog
        period={hydrateNullablePeriod(pendingDelete, allPeriods)}
        timezone={displayTimezone}
        onClose={() => setPendingDelete(null)}
        onDelete={(scope) => pendingDelete && remove.mutate({ id: pendingDelete.id, scope })}
      />
      <MoveScopeDialog
        move={pendingMove}
        timezone={displayTimezone}
        onClose={() => setPendingMove(null)}
        onApply={(scope) => {
          if (!pendingMove) return;
          const payload = { ...pendingMove.payload, recurrenceEditScope: scope };
          setPendingMove(null);
          void updatePeriod(payload).then(() => queryClient.invalidateQueries({ queryKey: ["snapshot"] }));
        }}
      />
    </div>
  );
}

function PeriodBlock({ period, layout, periods, selected, selectedDay, timezone, onSelect, onEdit, onDuplicate, onDelete, onMove }: { period: TimePeriod; layout: { lane: number; lanes: number }; periods: TimePeriod[]; selected: boolean; selectedDay: Date; timezone: string; onSelect: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void; onMove: (payload: PeriodMovePayload) => void }) {
  const start = new Date(period.startAtUtc);
  const end = new Date(period.endAtUtc);
  const dayStart = new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate());
  const dayEnd = addDays(dayStart, 1);
  const visibleStart = start < dayStart ? dayStart : start;
  const visibleEnd = end > dayEnd ? dayEnd : end;
  const top = zonedHourPosition(visibleStart, timezone) * hourHeight;
  const height = Math.max(42, (differenceInMinutes(visibleEnd, visibleStart) / 60) * hourHeight);
  const overlaps = periods.some((other) => other.id !== period.id && Date.parse(period.startAtUtc) < Date.parse(other.endAtUtc) && Date.parse(period.endAtUtc) > Date.parse(other.startAtUtc));
  const laneGap = 8;
  const left = `calc(1rem + ${layout.lane} * ((100% - 2.5rem - ${(layout.lanes - 1) * laneGap}px) / ${layout.lanes} + ${laneGap}px))`;
  const width = `calc((100% - 2.5rem - ${(layout.lanes - 1) * laneGap}px) / ${layout.lanes})`;

  function beginPointer(mode: "move" | "start" | "end", event: React.PointerEvent) {
    if (mode !== "move") event.preventDefault();
    event.stopPropagation();
    const initialY = event.clientY;
    const initialStart = new Date(period.startAtUtc);
    const initialEnd = new Date(period.endAtUtc);
    const duration = differenceInMinutes(initialEnd, initialStart);
    const target = event.currentTarget as HTMLElement;
    let moved = false;
    target.setPointerCapture(event.pointerId);
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (Math.abs(moveEvent.clientY - initialY) < 4) return;
      moved = true;
      const deltaMinutes = snapTo((moveEvent.clientY - initialY) / hourHeight * 60, snapMinutes);
      let nextStart = initialStart;
      let nextEnd = initialEnd;
      if (mode === "move") {
        nextStart = addMinutes(initialStart, deltaMinutes);
        nextEnd = addMinutes(initialEnd, deltaMinutes);
      } else if (mode === "start") {
        nextStart = addMinutes(initialStart, deltaMinutes);
        if (differenceInMinutes(nextEnd, nextStart) < snapMinutes) nextStart = addMinutes(nextEnd, -snapMinutes);
      } else {
        nextEnd = addMinutes(initialEnd, deltaMinutes);
        if (differenceInMinutes(nextEnd, nextStart) < snapMinutes) nextEnd = addMinutes(nextStart, snapMinutes);
      }
      const block = target.closest("[data-period-block]") as HTMLElement | null;
      if (block) {
        block.style.top = `${zonedHourPosition(nextStart, timezone) * hourHeight}px`;
        block.style.height = `${Math.max(42, differenceInMinutes(nextEnd, nextStart) / 60 * hourHeight)}px`;
      }
    };
    const onPointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (!moved) return;
      const deltaMinutes = snapTo((upEvent.clientY - initialY) / hourHeight * 60, snapMinutes);
      let nextStart = initialStart;
      let nextEnd = initialEnd;
      if (mode === "move") {
        nextStart = addMinutes(initialStart, deltaMinutes);
        nextEnd = addMinutes(initialEnd, deltaMinutes);
      } else if (mode === "start") {
        nextStart = addMinutes(initialStart, deltaMinutes);
        if (differenceInMinutes(nextEnd, nextStart) < snapMinutes) nextStart = addMinutes(nextEnd, -snapMinutes);
      } else {
        nextEnd = addMinutes(initialEnd, deltaMinutes);
        if (differenceInMinutes(nextEnd, nextStart) < snapMinutes) nextEnd = addMinutes(nextStart, snapMinutes);
      }
      onMove({ id: period.id, startAtUtc: nextStart.toISOString(), endAtUtc: nextEnd.toISOString() });
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button data-period-block className={`focus-ring absolute z-10 overflow-hidden rounded-[12px] border bg-panel p-3 text-left shadow-sm transition hover:-translate-y-0.5 ${overlaps ? "ring-2 ring-urgent/50" : ""} ${selected ? "shadow-[inset_0_0_0_1px_rgba(245,158,11,.45),0_0_24px_rgba(245,158,11,.13)]" : ""}`} style={{ top, height, left, width, borderColor: selected ? "hsl(var(--accent))" : period.color, borderLeftWidth: 5 }} onClick={onSelect} onPointerDown={(e) => beginPointer("move", e)}>
          <div className="absolute left-2 right-2 top-1 h-2 cursor-ns-resize rounded bg-line hover:bg-accent" onPointerDown={(e) => beginPointer("start", e)} />
          <div className="text-[14px] font-semibold">{period.title}</div>
          {height > 66 && <div className="mt-1 flex items-center gap-2 text-[12px] text-muted"><span>{formatZoned(start, timezone, "h:mm a")} - {formatZoned(end, timezone, "h:mm a")} - {period.category} - {period.linkedTaskCount} tasks</span>{period.recurrenceRule && <Repeat2 size={13} className="text-current" />}</div>}
          {overlaps && height > 86 && <div className="mt-1 text-[12px] text-urgent">Overlap warning</div>}
          <div className="absolute bottom-1 left-2 right-2 h-2 cursor-ns-resize rounded bg-line hover:bg-accent" onPointerDown={(e) => beginPointer("end", e)} />
        </button>
      </ContextMenu.Trigger>
      <ContextMenu.Content className="z-50 min-w-48 rounded-[12px] border border-line bg-panel p-1 shadow-panel">
        <ContextMenu.Item className="rounded-[8px] px-3 py-2 text-[13px] outline-none hover:bg-surface" onSelect={onEdit}>Edit</ContextMenu.Item>
        <ContextMenu.Item className="rounded-[8px] px-3 py-2 text-[13px] outline-none hover:bg-surface" onSelect={onDuplicate}>Duplicate</ContextMenu.Item>
        <ContextMenu.Item className="rounded-[8px] px-3 py-2 text-[13px] outline-none hover:bg-surface">Add linked task</ContextMenu.Item>
        <ContextMenu.Item className="rounded-[8px] px-3 py-2 text-[13px] outline-none hover:bg-surface">Mark complete</ContextMenu.Item>
        <ContextMenu.Item className="rounded-[8px] px-3 py-2 text-[13px] outline-none hover:bg-surface">Move to tomorrow</ContextMenu.Item>
        <ContextMenu.Item className="rounded-[8px] px-3 py-2 text-[13px] outline-none hover:bg-surface">Change color</ContextMenu.Item>
        <ContextMenu.Item className="rounded-[8px] px-3 py-2 text-[13px] text-urgent outline-none hover:bg-urgent/10" onSelect={onDelete}>Delete</ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}

function snapTo(value: number, interval: number) {
  return Math.round(value / interval) * interval;
}

function periodTopForDay(period: TimePeriod, timezone: string) {
  return zonedHourPosition(period.startAtUtc, timezone) * hourHeight;
}

function layoutOverlappingPeriods(periods: TimePeriod[]) {
  const sorted = [...periods].sort((a, b) => Date.parse(a.startAtUtc) - Date.parse(b.startAtUtc));
  const result: Record<string, { lane: number; lanes: number }> = {};
  let group: TimePeriod[] = [];
  let groupEnd = 0;
  const flush = () => {
    if (!group.length) return;
    const laneEnds: number[] = [];
    const assigned = new Map<string, number>();
    for (const period of group) {
      const start = Date.parse(period.startAtUtc);
      const lane = laneEnds.findIndex((end) => end <= start);
      const resolvedLane = lane === -1 ? laneEnds.length : lane;
      laneEnds[resolvedLane] = Date.parse(period.endAtUtc);
      assigned.set(period.id, resolvedLane);
    }
    const lanes = Math.max(1, laneEnds.length);
    for (const period of group) result[period.id] = { lane: assigned.get(period.id) ?? 0, lanes };
    group = [];
    groupEnd = 0;
  };
  for (const period of sorted) {
    const start = Date.parse(period.startAtUtc);
    const end = Date.parse(period.endAtUtc);
    if (group.length && start >= groupEnd) flush();
    group.push(period);
    groupEnd = Math.max(groupEnd, end);
  }
  flush();
  return result;
}

function PeriodDetail({ period, allPeriods, tasks, timezone, onUnlinkTask, onEdit, onDelete }: { period: TimePeriod | null; allPeriods: TimePeriod[]; tasks: Task[]; timezone: string; onUnlinkTask: (task: Task, periodID: string) => void; onEdit: (period: TimePeriod) => void; onDelete: (period: TimePeriod) => void }) {
  const linkedTasks = period ? tasks.filter((task) => task.linkedPeriodIds.includes(basePeriodID(period.id))) : [];
  return (
    <aside className="scroll-smooth-ui h-full min-h-0 overflow-auto rounded-[14px] border border-line bg-panel p-4 shadow-panel">
      <h2 className="text-[16px] font-semibold">Period details</h2>
      {!period ? <p className="mt-2 text-[13px] text-muted">Select a time period to preview details. Use Edit when you want to change it.</p> : (
        <div className="mt-4">
          <div className="rounded-[12px] border border-line bg-surface p-4" style={{ borderLeft: `4px solid ${period.color}` }}>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded bg-current/10 px-2 py-0.5 text-[11px] font-medium text-current">{period.status}</span>
              <span className="rounded bg-panel px-2 py-0.5 text-[11px] text-muted">{period.category}</span>
            </div>
            <h3 className="break-words text-[18px] font-semibold leading-6">{period.title}</h3>
            <dl className="mt-4 space-y-3 text-[13px]">
              <Detail label="Time" value={`${formatZoned(period.startAtUtc, timezone, "MMM d, h:mm a")} - ${formatZoned(period.endAtUtc, timezone, "h:mm a")}`} />
              <Detail label="Duration" value={`${Math.round(differenceInMinutes(new Date(period.endAtUtc), new Date(period.startAtUtc)) / 15) * 15} min`} />
              <Detail label="Timezone" value={period.sourceTimezone} />
              <Detail label="Repeat" value={repeatLabel(period, allPeriods)} />
              <Detail label="Linked tasks" value={String(period.linkedTaskCount)} />
            </dl>
            {period.notes && <p className="scroll-smooth-ui mt-4 max-h-64 overflow-auto whitespace-pre-line break-words rounded-[10px] border border-line bg-panel p-3 text-[13px] text-muted">{period.notes}</p>}
          </div>
          <div className="mt-4 rounded-[12px] border border-line bg-surface p-4">
            <h3 className="text-[13px] font-semibold uppercase text-muted">Linked tasks</h3>
            <div className="scroll-smooth-ui mt-3 max-h-72 space-y-2 overflow-auto pr-1">
              {linkedTasks.map((task) => (
                <div key={task.id} className="rounded-[10px] border border-line bg-panel p-3">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
                    <span className="rounded bg-surface px-2 py-0.5 text-[11px] text-muted">{task.priority}</span>
                    <button className="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-muted hover:bg-urgent/10 hover:text-urgent" onClick={() => onUnlinkTask(task, basePeriodID(period.id))} aria-label={`Remove ${task.title}`}>
                      <X size={14} />
                    </button>
                  </div>
                  <div className="mt-1 line-clamp-2 text-[12px] text-muted">{task.content ?? "No content added yet."}</div>
                  <div className="mt-2 text-[11px] uppercase text-muted">{task.status}</div>
                </div>
              ))}
              {!linkedTasks.length && <div className="rounded-[10px] border border-dashed border-line p-3 text-[13px] text-muted">No tasks linked to this period yet.</div>}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="focus-ring inline-flex items-center gap-2 rounded-[10px] bg-accent px-3 py-2 font-semibold text-surface" onClick={() => onEdit(period)}><Edit3 size={15} /> Edit</button>
            <button className="focus-ring inline-flex items-center gap-2 rounded-[10px] border border-urgent/30 px-3 py-2 text-urgent hover:bg-urgent/10" onClick={() => onDelete(period)}><Trash2 size={15} /> Delete</button>
          </div>
        </div>
      )}
    </aside>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 border-t border-line pt-3"><dt className="text-muted">{label}</dt><dd className="text-right text-ink">{value}</dd></div>;
}

function ToolbarIcon({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return <button className="focus-ring rounded-[10px] border border-line bg-panel p-2 hover:bg-surface" onClick={onClick}>{children}</button>;
}

function DeletePeriodDialog({ period, timezone, onClose, onDelete }: { period: TimePeriod | null; timezone: string; onClose: () => void; onDelete: (scope: "this" | "following" | "series") => void }) {
  const isRepeating = Boolean(period?.recurrenceRule);
  return (
    <Dialog.Root open={Boolean(period)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[14px] border border-line bg-panel p-5 shadow-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-[18px] font-semibold">Delete period</Dialog.Title>
              <Dialog.Description className="mt-2 text-[13px] leading-5 text-muted">
                {isRepeating ? "This is a repeating timeline. Choose how much of the series should be deleted." : "Delete this timeline period? This action cannot be undone."}
              </Dialog.Description>
            </div>
            <button className="focus-ring rounded-[8px] p-2 hover:bg-surface" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
          {period && (
            <div className="mt-4 rounded-[12px] border border-line bg-surface p-3">
              <div className="truncate font-semibold">{period.title}</div>
              <div className="mt-1 text-[12px] text-muted">{formatZoned(period.startAtUtc, timezone, "MMM d, h:mm a")} - {formatZoned(period.endAtUtc, timezone, "h:mm a")}</div>
            </div>
          )}
          <div className="mt-5 flex flex-col gap-2">
            {isRepeating ? (
              <>
                <button className="focus-ring rounded-[10px] border border-line px-3 py-2 text-left hover:bg-surface" onClick={() => onDelete("this")}>This timeline</button>
                <button className="focus-ring rounded-[10px] border border-line px-3 py-2 text-left hover:bg-surface" onClick={() => onDelete("following")}>This and following timelines</button>
                <button className="focus-ring rounded-[10px] bg-urgent px-3 py-2 text-left text-white hover:bg-urgent/90" onClick={() => onDelete("series")}>All timelines</button>
              </>
            ) : (
              <button className="focus-ring rounded-[10px] bg-urgent px-3 py-2 text-white hover:bg-urgent/90" onClick={() => onDelete("series")}>Delete period</button>
            )}
            <button className="focus-ring rounded-[10px] border border-line px-3 py-2 hover:bg-surface" onClick={onClose}>Cancel</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MoveScopeDialog({ move, timezone, onClose, onApply }: { move: { period: TimePeriod; payload: PeriodMovePayload } | null; timezone: string; onClose: () => void; onApply: (scope: "this" | "following" | "series") => void }) {
  return (
    <Dialog.Root open={Boolean(move)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[14px] border border-line bg-panel p-5 shadow-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-[18px] font-semibold">Update repeating period</Dialog.Title>
              <Dialog.Description className="mt-2 text-[13px] leading-5 text-muted">
                Choose how this move or resize should apply to the repeated timeline.
              </Dialog.Description>
            </div>
            <button className="focus-ring rounded-[8px] p-2 hover:bg-surface" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
          {move && (
            <div className="mt-4 rounded-[12px] border border-line bg-surface p-3">
              <div className="truncate font-semibold">{move.period.title}</div>
              <div className="mt-1 text-[12px] text-muted">
                {formatZoned(move.payload.startAtUtc, timezone, "MMM d, h:mm a")} - {formatZoned(move.payload.endAtUtc, timezone, "h:mm a")}
              </div>
            </div>
          )}
          <div className="mt-5 flex flex-col gap-2">
            <button className="focus-ring rounded-[10px] border border-line px-3 py-2 text-left hover:bg-surface" onClick={() => onApply("this")}>This timeline</button>
            <button className="focus-ring rounded-[10px] border border-line px-3 py-2 text-left hover:bg-surface" onClick={() => onApply("following")}>This and following timelines</button>
            <button className="focus-ring rounded-[10px] bg-accent px-3 py-2 text-left font-semibold text-surface hover:bg-accent/90" onClick={() => onApply("series")}>All timelines</button>
            <button className="focus-ring rounded-[10px] border border-line px-3 py-2 hover:bg-surface" onClick={onClose}>Cancel</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function basePeriodID(id: string) {
  return id.split("#occ#")[0];
}

function hydrateSeriesPeriod(period: TimePeriod, allPeriods: TimePeriod[]) {
  if (period.recurrenceRule) return period;
  const periodBaseID = basePeriodID(period.id);
  const seriesMember = allPeriods.find((candidate) => basePeriodID(candidate.id) === periodBaseID && candidate.recurrenceRule);
  const inferredRule = seriesMember?.recurrenceRule ?? inferredRecurrenceRule(period, allPeriods);
  return inferredRule ? { ...period, recurrenceRule: inferredRule } : period;
}

function hydrateNullablePeriod(period: TimePeriod | null, allPeriods: TimePeriod[]) {
  return period ? hydrateSeriesPeriod(period, allPeriods) : null;
}

function repeatLabel(period: TimePeriod, allPeriods: TimePeriod[] = []) {
  const rule = period.recurrenceRule ?? inferredRecurrenceRule(period, allPeriods);
  if (!rule || rule.frequency === "none") return "Does not repeat";
  const every = rule.intervalCount > 1 ? `Every ${rule.intervalCount} ` : "Every ";
  if (rule.frequency === "daily") return `${every}${rule.intervalCount > 1 ? "days" : "day"}`;
  if (rule.frequency === "weekdays") return "Every weekday";
  if (rule.frequency === "weekly") return `${every}${rule.intervalCount > 1 ? "weeks" : "week"}`;
  if (rule.frequency === "monthly") return `${every}${rule.intervalCount > 1 ? "months" : "month"}`;
  return "Custom repeat";
}

function inferredRecurrenceRule(period: TimePeriod, allPeriods: TimePeriod[]) {
  const periodBaseID = basePeriodID(period.id);
  const sameSeriesRule = allPeriods.find((candidate) => basePeriodID(candidate.id) === periodBaseID && candidate.recurrenceRule)?.recurrenceRule;
  if (sameSeriesRule) return sameSeriesRule;

  const start = new Date(period.startAtUtc);
  const duration = Date.parse(period.endAtUtc) - Date.parse(period.startAtUtc);
  const hasDailyMatch = allPeriods.some((candidate) => {
    if (candidate.id === period.id || candidate.title !== period.title) return false;
    if (Date.parse(candidate.endAtUtc) - Date.parse(candidate.startAtUtc) !== duration) return false;
    const candidateStart = new Date(candidate.startAtUtc);
    const dayDelta = Math.round((Date.UTC(candidateStart.getUTCFullYear(), candidateStart.getUTCMonth(), candidateStart.getUTCDate()) - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) / 86400000);
    return dayDelta > 0 && candidateStart.getUTCHours() === start.getUTCHours() && candidateStart.getUTCMinutes() === start.getUTCMinutes();
  });
  return hasDailyMatch ? { frequency: "daily" as const, intervalCount: 1, weekdays: [], monthRule: null, startsOn: null, endsOn: null, occurrenceCount: null } : null;
}

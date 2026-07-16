import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Edit3, GripVertical, Plus, Search, Trash2, X } from "lucide-react";
import type { DragEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Fuse from "fuse.js";
import { completeTask, createTask, deleteTask, getSnapshot, updateTask } from "@/lib/api";
import { TaskEditor } from "@/components/TaskEditor";
import type { Snapshot, Task, TaskType, TimePeriod } from "@shared/contracts";
import { useSearchParams } from "react-router-dom";
import { formatZoned, zonedDateTimeToUtc, zonedDayBoundsUtc, zonedNow } from "@/lib/datetime";

type TaskSavePayload = { id?: string; title: string; content: string | null; priority: Task["priority"]; typeId: string | null; dueAtUtc: string | null; linkedPeriodIds: string[]; recurrenceRule: Task["recurrenceRule"]; recurrenceEditScope?: "this" | "following" | "series" };
type Column = { id: string; label: string; hint: string; tasks: Task[]; tone: string };
type BoardOrder = Record<string, string[]>;

export function TasksPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Task | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [draggingID, setDraggingID] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ columnID: string; index: number } | null>(null);
  const [boardOrder, setBoardOrder] = useState<BoardOrder>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { data } = useQuery({ queryKey: ["snapshot"], queryFn: getSnapshot });
  const tasks = data?.tasks ?? [];
  const taskTypes = data?.taskTypes ?? [];
  const periods = data?.periods ?? [];
  const timezone = data?.settings.defaultTimezone ?? "America/Denver";
  const visible = useMemo(() => filterTasks(tasks, query), [query, tasks]);
  const columns = useMemo(() => buildColumns(visible, boardOrder, timezone), [visible, boardOrder, timezone]);
  const selectedTask = selected ? tasks.find((task) => task.id === selected.id) ?? null : visible[0] ?? null;
  const move = useMutation({ mutationFn: ({ task, columnID }: { task: Task; columnID: string }) => moveTaskToColumn(task, columnID, timezone), onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshot"] }) });
  const unlinkPeriod = useMutation({ mutationFn: ({ task, periodID }: { task: Task; periodID: string }) => updateTaskPayload(task, { linkedPeriodIds: task.linkedPeriodIds.filter((id) => id !== periodID) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshot"] }) });
  const save = useMutation({
    mutationFn: (payload: TaskSavePayload) => payload.id ? updateTask({ ...payload, id: payload.id }) : createTask(payload),
    onSuccess: () => {
      setEditorOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["snapshot"] });
    }
  });
  const remove = useMutation({
    mutationFn: deleteTask,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["snapshot"] });
      setEditorOpen(false);
      setEditing(null);
      setSelected((current) => current?.id === id ? null : current);
      const previous = qc.getQueryData<Snapshot>(["snapshot"]);
      qc.setQueryData<Snapshot>(["snapshot"], (current) => current ? { ...current, tasks: current.tasks.filter((task) => task.id !== id) } : current);
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) qc.setQueryData(["snapshot"], context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["snapshot"] });
    }
  });
  useEffect(() => {
    if (selected && !tasks.some((task) => task.id === selected.id)) setSelected(null);
  }, [selected, tasks]);
  useEffect(() => {
    if (searchParams.get("add") === "task") {
      setEditing(null);
      setEditorOpen(true);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);
  function dropTask(taskID: string, columnID: string, targetIndex: number) {
    const task = tasks.find((item) => item.id === taskID);
    if (!task) return;
    const sourceColumnID = currentColumnID(task, timezone);
    setDraggingID(null);
    setBoardOrder((current) => reorderBoard(current, columns, taskID, sourceColumnID, columnID, targetIndex));
    if (sourceColumnID !== columnID) move.mutate({ task, columnID });
  }

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_360px] gap-4 p-5">
      <section className="flex min-w-0 flex-col rounded-[14px] border border-line bg-panel p-4 shadow-panel">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-semibold">Task board</h1>
            <p className="text-[13px] text-muted">{visible.length} tasks - status columns with priority, type, due date, and linked-period tags</p>
          </div>
          <div className="flex min-w-0 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-muted"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} className="w-56 bg-transparent outline-none" placeholder="Search tasks" /></div>
        </div>
        <div className="scroll-smooth-ui min-h-0 flex-1 overflow-auto pb-2 pr-1">
          <div className="flex h-full min-w-max gap-3">
            {columns.map((column) => (
              <section
                key={column.id}
                className={`flex h-full w-[292px] shrink-0 flex-col rounded-[12px] border border-line bg-surface/70 transition ${draggingID ? "ring-1 ring-accent/30" : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  dropTask(event.dataTransfer.getData("text/plain"), column.id, column.tasks.length);
                  setDropTarget(null);
                }}
              >
                <div className="border-b border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${column.tone}`} />
                      <h2 className="font-semibold">{column.label}</h2>
                    </div>
                    <span className="rounded bg-panel px-2 py-0.5 text-[12px] text-muted">{column.tasks.length}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-muted">{column.hint}</p>
                </div>
                <div className="scroll-smooth-ui h-[calc(100vh-260px)] min-h-0 space-y-2 overflow-y-auto overflow-x-hidden p-2">
                  {column.tasks.map((task, index) => (
                    <div key={task.id}>
                      <DropGap active={dropTarget?.columnID === column.id && dropTarget.index === index} />
                      <TaskCard task={task} selected={selectedTask?.id === task.id} taskTypes={taskTypes} periods={periods} timezone={timezone} onSelect={() => setSelected(task)} onDropAt={(taskID, targetIndex) => { dropTask(taskID, column.id, targetIndex); setDropTarget(null); }} onDragOverAt={(targetIndex) => setDropTarget({ columnID: column.id, index: targetIndex })} index={index} onDragStart={(event) => { event.dataTransfer.setData("text/plain", task.id); event.dataTransfer.effectAllowed = "move"; setDraggingID(task.id); }} onDragEnd={() => { setDraggingID(null); setDropTarget(null); }} />
                    </div>
                  ))}
                  <DropGap active={dropTarget?.columnID === column.id && dropTarget.index === column.tasks.length} />
                  {!column.tasks.length && <div className="rounded-[10px] border border-dashed border-line p-3 text-[13px] text-muted">Nothing here.</div>}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
      <TaskDetailPanel task={selectedTask} taskTypes={taskTypes} periods={periods} timezone={timezone} onMove={(task, columnID) => move.mutate({ task, columnID })} onUnlinkPeriod={(task, periodID) => unlinkPeriod.mutate({ task, periodID })} onEdit={(task) => { setEditing(task); setEditorOpen(true); }} onNew={() => { setEditing(null); setEditorOpen(true); }} onDelete={(task) => remove.mutate(task.id)} />
      <TaskEditor open={editorOpen} task={editing} taskTypes={taskTypes} periods={periods} defaultTimezone={timezone} onOpenChange={setEditorOpen} onSave={(payload) => save.mutate(payload)} onDelete={(id) => remove.mutate(id)} />
    </div>
  );
}

function TaskCard({ task, selected, taskTypes, periods, timezone, onSelect, onDropAt, onDragOverAt, index, onDragStart, onDragEnd }: { task: Task; selected: boolean; taskTypes: TaskType[]; periods: TimePeriod[]; timezone: string; onSelect: () => void; onDropAt: (taskID: string, targetIndex: number) => void; onDragOverAt: (targetIndex: number) => void; index: number; onDragStart: (event: DragEvent<HTMLDivElement>) => void; onDragEnd: () => void }) {
  const type = taskTypes.find((item) => item.id === task.typeId);
  const linked = task.linkedPeriodIds.map((id) => periods.find((period) => basePeriodID(period.id) === id)).filter((period): period is TimePeriod => Boolean(period));
  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      className={`focus-ring group relative min-h-[96px] w-full cursor-grab overflow-hidden rounded-[10px] border border-r-[5px] p-3 text-left transition active:cursor-grabbing hover:-translate-y-0.5 hover:border-accent/70 hover:bg-panel ${selected ? "border-accent bg-panel shadow-[inset_0_0_0_1px_rgba(245,158,11,.35)]" : "border-line bg-panel/80"}`}
      style={{ borderRightColor: priorityBorderColor(task.priority) }}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragEnter={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onDragOverAt(index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0));
      }}
      onDragOver={(event) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        onDragOverAt(index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0));
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        const after = event.clientY > rect.top + rect.height / 2;
        onDropAt(event.dataTransfer.getData("text/plain"), index + (after ? 1 : 0));
      }}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-6 w-5 shrink-0 items-center justify-center text-muted opacity-70 transition group-hover:text-accent group-hover:opacity-100" aria-hidden="true">
          <GripVertical size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className={`truncate pr-7 text-[14px] font-medium leading-5 ${task.status === "completed" ? "text-muted line-through" : ""}`}>{task.title}</div>
          <div className="line-clamp-2 mt-1 text-[12px] leading-5 text-muted">{task.content ?? "No content added yet."}</div>
          <div className="mt-2 flex h-[22px] min-w-0 gap-1.5 overflow-hidden">
            <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
            {type && <Badge>{type.name}</Badge>}
            {task.dueAtUtc && <Badge>{formatZoned(task.dueAtUtc, timezone, "MMM d")}</Badge>}
          </div>
        </div>
      </div>
      {!!linked.length && (
        <span className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-[8px] border border-line bg-surface text-accent" title="Linked to time period" aria-label="Linked to time period">
          <CalendarClock size={13} />
        </span>
      )}
    </div>
  );
}

function DropGap({ active }: { active: boolean }) {
  return <div className={`transition-all duration-150 ${active ? "h-5" : "h-0"}`}><div className={`h-full rounded-[10px] border border-dashed border-accent bg-accent/10 transition-opacity ${active ? "opacity-100" : "opacity-0"}`} /></div>;
}

function TaskDetailPanel({ task, taskTypes, periods, timezone, onMove, onUnlinkPeriod, onEdit, onNew, onDelete }: { task: Task | null; taskTypes: TaskType[]; periods: TimePeriod[]; timezone: string; onMove: (task: Task, columnID: string) => void; onUnlinkPeriod: (task: Task, periodID: string) => void; onEdit: (task: Task) => void; onNew: () => void; onDelete: (task: Task) => void }) {
  const type = taskTypes.find((item) => item.id === task?.typeId);
  const linked = task?.linkedPeriodIds.map((id) => periods.find((period) => basePeriodID(period.id) === id)).filter((period): period is TimePeriod => Boolean(period)) ?? [];
  return (
    <aside className="scroll-smooth-ui overflow-auto rounded-[14px] border border-line bg-panel p-4 shadow-panel">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-[16px] font-semibold">Task details</h2>
        <button className="focus-ring inline-flex items-center gap-2 rounded-[10px] bg-ink px-3 py-2 text-white" onClick={onNew}><Plus size={15} /> New</button>
      </div>
      {!task ? <p className="text-[13px] text-muted">Select a task to preview details. Editing is available from the Edit button.</p> : (
        <div>
          <div className="rounded-[12px] border border-line bg-surface p-4">
            <div className="mb-3 flex items-center gap-2">
              <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
              <Badge>{task.status}</Badge>
            </div>
            <h3 className="break-words text-[18px] font-semibold leading-6">{task.title}</h3>
            {task.content && <p className="scroll-smooth-ui mt-3 max-h-72 overflow-auto whitespace-pre-line break-words rounded-[10px] border border-line bg-panel p-3 text-[13px] leading-5 text-muted">{task.content}</p>}
            <label className="mt-4 block text-[13px] font-medium text-muted">
              <span className="mb-1 block">Board step</span>
              <select className="input" value={currentColumnID(task, timezone)} onChange={(event) => onMove(task, event.target.value)}>
                <option value="overdue">Overdue</option>
                <option value="today">Today</option>
                <option value="planned">Planned</option>
                <option value="inbox">Inbox</option>
                <option value="done">Done</option>
              </select>
            </label>
            <dl className="mt-4 space-y-3 text-[13px]">
              <Detail label="Type" value={type?.name ?? "No type"} />
              <Detail label="Due" value={task.dueAtUtc ? formatZoned(task.dueAtUtc, timezone, "EEE, MMM d, h:mm a") : "No due date"} />
              <Detail label="Created" value={formatZoned(task.createdAtUtc, timezone, "MMM d, h:mm a")} />
              <Detail label="Linked periods" value={linked.length ? `${linked.length} period${linked.length === 1 ? "" : "s"}` : "None"} />
            </dl>
          </div>
          {!!linked.length && (
            <div className="mt-4">
              <h3 className="mb-2 text-[13px] font-semibold uppercase text-muted">Linked time periods</h3>
              <div className="space-y-2">
                {linked.map((period) => <div key={period.id} className="rounded-[10px] border border-line p-3" style={{ borderLeft: `4px solid ${period.color}` }}>
                  <div className="flex min-w-0 items-center gap-2 font-medium">
                    <CalendarClock size={14} className="shrink-0 text-accent" />
                    <span className="truncate">{compactPeriodLabel(period, timezone)}</span>
                    <button className="focus-ring ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-muted hover:bg-urgent/10 hover:text-urgent" onClick={() => onUnlinkPeriod(task, basePeriodID(period.id))} aria-label={`Remove ${period.title}`}>
                      <X size={14} />
                    </button>
                  </div>
                  <div className="text-[12px] text-muted">{formatZoned(period.startAtUtc, timezone, "MMM d, h:mm a")} - {formatZoned(period.endAtUtc, timezone, "h:mm a")}</div>
                </div>)}
              </div>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button className="focus-ring inline-flex items-center gap-2 rounded-[10px] bg-accent px-3 py-2 font-semibold text-surface" onClick={() => onEdit(task)}><Edit3 size={15} /> Edit</button>
            <button className="focus-ring inline-flex items-center gap-2 rounded-[10px] border border-urgent/30 px-3 py-2 text-urgent hover:bg-urgent/10" onClick={() => onDelete(task)}><Trash2 size={15} /> Delete</button>
          </div>
        </div>
      )}
    </aside>
  );
}

async function moveTaskToColumn(task: Task, columnID: string, timezone: string) {
  if (currentColumnID(task, timezone) === columnID) return;
  if (columnID === "done") {
    await completeTask(task.id, true);
    return;
  }
  if (task.status === "completed") {
    await completeTask(task.id, false);
  }
  const dueAtUtc = dueForColumn(columnID, timezone);
  await updateTaskPayload(task, {
    dueAtUtc,
    linkedPeriodIds: columnID === "inbox" ? [] : task.linkedPeriodIds
  });
}

function updateTaskPayload(task: Task, patch: Partial<TaskSavePayload>) {
  return updateTask({
    id: task.id,
    title: patch.title ?? task.title,
    content: patch.content !== undefined ? patch.content : task.content,
    priority: patch.priority ?? task.priority,
    typeId: patch.typeId !== undefined ? patch.typeId : task.typeId,
    dueAtUtc: patch.dueAtUtc !== undefined ? patch.dueAtUtc : task.dueAtUtc,
    linkedPeriodIds: patch.linkedPeriodIds ?? task.linkedPeriodIds,
    recurrenceRule: patch.recurrenceRule !== undefined ? patch.recurrenceRule : task.recurrenceRule,
    recurrenceEditScope: patch.recurrenceEditScope ?? "series"
  });
}

function dueForColumn(columnID: string, timezone: string) {
  const now = zonedNow(timezone);
  if (columnID === "overdue") {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return zonedDateTimeToUtc(yesterday, "17:00", timezone);
  }
  if (columnID === "today") return new Date(Date.now() + 60 * 60 * 1000).toISOString();
  if (columnID === "planned") {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return zonedDateTimeToUtc(tomorrow, "18:00", timezone);
  }
  return "";
}

function currentColumnID(task: Task, timezone: string) {
  if (task.status === "completed") return "done";
  const due = task.dueAtUtc ? Date.parse(task.dueAtUtc) : null;
  const now = Date.now();
  const bounds = zonedDayBoundsUtc(zonedNow(timezone), timezone);
  const todayStart = Date.parse(bounds.startUtc);
  const tomorrowStart = Date.parse(bounds.endUtc) + 1;
  if (due !== null && due < now) return "overdue";
  if (task.priority === "urgent" || (due !== null && due >= todayStart && due < tomorrowStart)) return "today";
  if (due !== null || task.linkedPeriodIds.length) return "planned";
  return "inbox";
}

function filterTasks(tasks: Task[], query: string) {
  return query ? new Fuse(tasks, { keys: ["title", "priority"], threshold: 0.35 }).search(query).map((result) => result.item) : tasks;
}

function buildColumns(tasks: Task[], boardOrder: BoardOrder, timezone: string): Column[] {
  const now = Date.now();
  const bounds = zonedDayBoundsUtc(zonedNow(timezone), timezone);
  const todayStart = Date.parse(bounds.startUtc);
  const tomorrowStart = Date.parse(bounds.endUtc) + 1;
  const isOverdue = (task: Task) => task.status !== "completed" && Boolean(task.dueAtUtc) && Date.parse(task.dueAtUtc as string) < now;
  const isToday = (task: Task) => task.status !== "completed" && !isOverdue(task) && (task.priority === "urgent" || (Boolean(task.dueAtUtc) && Date.parse(task.dueAtUtc as string) >= todayStart && Date.parse(task.dueAtUtc as string) < tomorrowStart));
  const isPlanned = (task: Task) => task.status !== "completed" && !isOverdue(task) && !isToday(task) && (task.linkedPeriodIds.length > 0 || (Boolean(task.dueAtUtc) && Date.parse(task.dueAtUtc as string) >= tomorrowStart));
  const isInbox = (task: Task) => task.status !== "completed" && !isOverdue(task) && !isToday(task) && !isPlanned(task);
  return [
    { id: "overdue", label: "Overdue", hint: "Due date has passed", tone: "bg-urgent", tasks: tasks.filter(isOverdue) },
    { id: "today", label: "Today", hint: "Due today or urgent", tone: "bg-current", tasks: tasks.filter(isToday) },
    { id: "planned", label: "Planned", hint: "Scheduled or linked work", tone: "bg-accent", tasks: tasks.filter(isPlanned) },
    { id: "inbox", label: "Inbox", hint: "No schedule yet", tone: "bg-muted", tasks: tasks.filter(isInbox) },
    { id: "done", label: "Done", hint: "Completed work", tone: "bg-green-500", tasks: tasks.filter((task) => task.status === "completed") }
  ].map((column) => ({ ...column, tasks: applyColumnOrder(column.tasks, boardOrder[column.id]) }));
}

function applyColumnOrder(tasks: Task[], order: string[] | undefined) {
  if (!order?.length) return [...tasks].sort(compareTasksByDate);
  const ranks = new Map(order.map((id, index) => [id, index]));
  return [...tasks].sort((a, b) => {
    const rankA = ranks.get(a.id);
    const rankB = ranks.get(b.id);
    if (rankA !== undefined || rankB !== undefined) return (rankA ?? Number.MAX_SAFE_INTEGER) - (rankB ?? Number.MAX_SAFE_INTEGER);
    return compareTasksByDate(a, b);
  });
}

function compareTasksByDate(a: Task, b: Task) {
  const dueA = a.dueAtUtc ? Date.parse(a.dueAtUtc) : Number.MAX_SAFE_INTEGER;
  const dueB = b.dueAtUtc ? Date.parse(b.dueAtUtc) : Number.MAX_SAFE_INTEGER;
  if (dueA !== dueB) return dueA - dueB;
  return Date.parse(a.createdAtUtc) - Date.parse(b.createdAtUtc);
}

function reorderBoard(current: BoardOrder, columns: Column[], taskID: string, sourceColumnID: string, targetColumnID: string, targetIndex: number): BoardOrder {
  if (!taskID) return current;
  const next: BoardOrder = { ...current };
  const sourceColumn = columns.find((column) => column.id === sourceColumnID);
  const sourceIndex = sourceColumn?.tasks.findIndex((task) => task.id === taskID) ?? -1;
  for (const column of columns) {
    next[column.id] = [...(next[column.id] ?? column.tasks.map((task) => task.id))].filter((id) => id !== taskID);
  }
  const target = next[targetColumnID] ?? [];
  const adjustedIndex = sourceColumnID === targetColumnID && sourceIndex > -1 && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  target.splice(Math.max(0, Math.min(adjustedIndex, target.length)), 0, taskID);
  next[targetColumnID] = target;
  return next;
}

function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium leading-4 ${tone ?? "bg-surface text-muted"}`}>{children}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 border-t border-line pt-3"><dt className="text-muted">{label}</dt><dd className="text-right text-ink">{value}</dd></div>;
}

function priorityTone(priority: Task["priority"]) {
  if (priority === "urgent") return "bg-urgent/10 text-urgent";
  if (priority === "high") return "bg-orange-500/15 text-orange-300";
  if (priority === "medium") return "bg-current/10 text-current";
  if (priority === "low") return "bg-green-500/10 text-green-300";
  return "bg-surface text-muted";
}

function priorityBorderColor(priority: Task["priority"]) {
  if (priority === "urgent") return "hsl(var(--urgent))";
  if (priority === "high") return "#fb923c";
  if (priority === "medium") return "hsl(var(--current))";
  if (priority === "low") return "#22c55e";
  return "hsl(var(--line))";
}

function compactPeriodLabel(period: TimePeriod, timezone: string) {
  const words = period.title.trim().split(/\s+/).slice(0, 4).join(" ");
  return `${formatZoned(period.startAtUtc, timezone, "h:mm a")} ${words}`;
}

function basePeriodID(id: string) {
  return id.split("#occ#")[0];
}

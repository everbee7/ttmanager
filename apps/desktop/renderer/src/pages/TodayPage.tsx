import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { differenceInMinutes, format } from "date-fns";
import { CalendarClock, Clock, Focus, Pencil, Plus, Target } from "lucide-react";
import { motion } from "framer-motion";
import { getSnapshot } from "@/lib/api";
import type { Task, TaskType, TimePeriod } from "@shared/contracts";
import { FocusMode } from "@/components/FocusMode";
import { useNavigate } from "react-router-dom";
import { formatZoned, sameZonedDay } from "@/lib/datetime";

type ContextSelection = { type: "task"; item: Task } | { type: "period"; item: TimePeriod };

export function TodayPage() {
  const navigate = useNavigate();
  const [focusOpen, setFocusOpen] = useState(false);
  const [selectedContext, setSelectedContext] = useState<ContextSelection | null>(null);
  const { data, isError, error } = useQuery({ queryKey: ["snapshot"], queryFn: getSnapshot });

  const now = new Date();
  const periods = data?.periods ?? [];
  const tasks = data?.tasks ?? [];
  const taskTypes = data?.taskTypes ?? [];
  const timezone = data?.settings.defaultTimezone ?? "America/Denver";
  const liveContext = selectedContext?.type === "task"
    ? tasks.find((task) => task.id === selectedContext.item.id)
      ? { type: "task" as const, item: tasks.find((task) => task.id === selectedContext.item.id) as Task }
      : null
    : selectedContext?.type === "period"
      ? periods.find((period) => period.id === selectedContext.item.id)
        ? { type: "period" as const, item: periods.find((period) => period.id === selectedContext.item.id) as TimePeriod }
        : null
      : null;
  const todayPeriods = periods
    .filter((period) => sameZonedDay(period.startAtUtc, now, timezone) || sameZonedDay(period.endAtUtc, now, timezone))
    .sort((a, b) => Date.parse(a.startAtUtc) - Date.parse(b.startAtUtc));
  const activePeriods = activePeriodList(todayPeriods);
  const active = activePeriods[0] ?? todayPeriods.find((period) => Date.parse(period.endAtUtc) > Date.now()) ?? todayPeriods[0];
  const next = todayPeriods.find((period) => Date.parse(period.startAtUtc) > Date.now() && !activePeriods.some((activePeriod) => activePeriod.id === period.id));
  const todayTasks = useMemo(() => {
    return [...tasks.filter((task) => task.status !== "completed" && isTodayTask(task, todayPeriods, now, timezone))]
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || taskTimeRank(a, todayPeriods) - taskTimeRank(b, todayPeriods));
  }, [tasks, todayPeriods, now, timezone]);
  const activeIDs = new Set(activePeriods.map((period) => basePeriodID(period.id)));
  const linkedToActive = activeIDs.size ? todayTasks.filter((task) => task.linkedPeriodIds.some((id) => activeIDs.has(id))) : [];
  const plannedMinutes = todayPeriods.reduce((total, period) => total + Math.max(0, differenceInMinutes(new Date(period.endAtUtc), new Date(period.startAtUtc))), 0);
  const elapsedMinutes = todayPeriods.reduce((total, period) => {
    const start = Date.parse(period.startAtUtc);
    const end = Date.parse(period.endAtUtc);
    return total + Math.max(0, Math.min(Date.now(), end) - start) / 60000;
  }, 0);
  const progress = plannedMinutes ? Math.min(100, Math.round((elapsedMinutes / plannedMinutes) * 100)) : 0;

  if (isError) return <div className="p-6 text-urgent">Local service error: {(error as Error).message}</div>;

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_360px] gap-4 p-5">
      <section className="scroll-smooth-ui min-w-0 overflow-auto pr-1">
        <header className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold">Today</h1>
            <p className="text-[13px] text-muted">{formatZoned(now, timezone, "EEEE, MMMM d")} - {timezone}</p>
          </div>
          <div className="w-80">
            <div className="mb-2 flex justify-between text-[12px] text-muted"><span>Planned day</span><span>{progress}% passed</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-current" style={{ width: `${progress}%` }} /></div>
          </div>
        </header>

        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[14px] border border-line bg-panel p-5 shadow-panel">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-urgent via-accent to-current" />
          <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-5">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase text-current"><Clock size={14} /> Active period{activePeriods.length === 1 ? "" : "s"}</div>
              {activePeriods.length ? (
                <div className="grid gap-2">
                  {activePeriods.map((period) => (
                    <button key={period.id} className="focus-ring rounded-[12px] border border-line bg-surface p-3 text-left hover:border-current/70" onClick={() => setSelectedContext({ type: "period", item: period })}>
                      <div className="truncate text-[17px] font-semibold">{period.title}</div>
                      <div className="mt-1 text-[12px] text-muted">{formatZoned(period.startAtUtc, timezone, "h:mm a")} to {formatZoned(period.endAtUtc, timezone, "h:mm a")} - {period.category}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <h2 className="truncate text-[24px] font-semibold">{active?.title ?? "No time period active"}</h2>
                  <p className="mt-1 text-[13px] text-muted">{active ? `${formatZoned(active.startAtUtc, timezone, "h:mm a")} to ${formatZoned(active.endAtUtc, timezone, "h:mm a")} - ${active.category}` : "Plan your day by adding your first time block."}</p>
                </>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton onClick={() => setFocusOpen(true)}><Focus size={15} /> Start focus</ActionButton>
                <ActionButton onClick={() => navigate("/timeline")}><Pencil size={15} /> Edit</ActionButton>
                <ActionButton onClick={() => navigate("/tasks?add=task")}><Plus size={15} /> Add linked task</ActionButton>
              </div>
            </div>
            <div className="rounded-[12px] border border-line bg-surface p-4">
              <div className="text-[12px] font-semibold uppercase text-muted">Next</div>
              <div className="mt-2 line-clamp-2 font-semibold">{next?.title ?? "No more periods"}</div>
              <div className="mt-2 text-[12px] text-muted">{next ? `${formatZoned(next.startAtUtc, timezone, "h:mm a")} - ${formatZoned(next.endAtUtc, timezone, "h:mm a")}` : "Nothing else scheduled today."}</div>
            </div>
          </div>
        </motion.section>

        <div className="mt-4 grid grid-cols-3 gap-4">
          <Metric icon={<Target size={16} />} label="Today's tasks" value={String(todayTasks.length)} />
          <Metric icon={<CalendarClock size={16} />} label="Periods today" value={String(todayPeriods.length)} />
          <Metric icon={<Focus size={16} />} label="Current linked" value={String(linkedToActive.length)} />
        </div>

        <div className="mt-4 grid min-h-[460px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
          <Panel title="Today's tasks" subtitle="Urgent first, then scheduled time">
            <div className="scroll-smooth-ui max-h-[410px] space-y-2 overflow-auto pr-1">
              {todayTasks.map((task) => (
                <TaskRow key={task.id} task={task} taskTypes={taskTypes} periods={todayPeriods} timezone={timezone} selected={liveContext?.type === "task" && liveContext.item.id === task.id} active={task.linkedPeriodIds.some((id) => activeIDs.has(id))} onClick={() => setSelectedContext({ type: "task", item: task })} />
              ))}
              {!todayTasks.length && <Empty>No tasks scheduled for today.</Empty>}
            </div>
          </Panel>
          <Panel title="Timeline" subtitle="All periods scheduled for today">
            <div className="scroll-smooth-ui max-h-[410px] space-y-2 overflow-auto pr-1">
              {todayPeriods.map((period) => (
                <PeriodRow key={period.id} period={period} timezone={timezone} active={active?.id === period.id} selected={liveContext?.type === "period" && liveContext.item.id === period.id} onClick={() => setSelectedContext({ type: "period", item: period })} />
              ))}
              {!todayPeriods.length && <Empty>No time periods today. Plan your day by adding your first time block.</Empty>}
            </div>
          </Panel>
        </div>
      </section>

      <ContextPanel selection={liveContext} tasks={tasks} periods={periods} taskTypes={taskTypes} timezone={timezone} />
      <FocusMode open={focusOpen} title={active?.title ?? "Focus"} minutes={active ? Math.max(1, Math.ceil((Date.parse(active.endAtUtc) - Date.now()) / 60000)) : 25} endAtUtc={active?.endAtUtc} onOpenChange={setFocusOpen} />
    </div>
  );
}

function activePeriodList(periods: TimePeriod[]) {
  const now = Date.now();
  return periods.filter((period) => Date.parse(period.startAtUtc) <= now && Date.parse(period.endAtUtc) > now);
}

function TaskRow({ task, taskTypes, periods, timezone, selected, active, onClick }: { task: Task; taskTypes: TaskType[]; periods: TimePeriod[]; timezone: string; selected: boolean; active: boolean; onClick: () => void }) {
  const type = taskTypes.find((item) => item.id === task.typeId);
  const linkedPeriod = task.linkedPeriodIds.map((id) => periods.find((period) => basePeriodID(period.id) === id)).find(Boolean);
  return (
    <button className={`focus-ring w-full rounded-[12px] border p-3 text-left transition hover:-translate-y-0.5 hover:border-current/70 ${selected ? "border-current/70 bg-current/5 shadow-[inset_3px_0_0_hsl(var(--current))]" : active ? "border-line bg-current/5" : "border-line bg-surface"}`} onClick={onClick}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold">{task.title}</span>
        <span className={`rounded px-2 py-1 text-[11px] ${priorityClass(task.priority)}`}>{task.priority}</span>
      </div>
      <div className="line-clamp-2 mt-1 text-[12px] leading-5 text-muted">{task.content ?? "No content added yet."}</div>
      <div className="mt-2 flex gap-1.5 overflow-hidden">
        {type && <Badge>{type.name}</Badge>}
        {task.dueAtUtc && <Badge>{formatZoned(task.dueAtUtc, timezone, "h:mm a")}</Badge>}
        {linkedPeriod && <Badge>{formatZoned(linkedPeriod.startAtUtc, timezone, "h:mm a")}</Badge>}
      </div>
    </button>
  );
}

function PeriodRow({ period, timezone, active, selected, onClick }: { period: TimePeriod; timezone: string; active: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button className={`focus-ring grid w-full grid-cols-[74px_minmax(0,1fr)] gap-3 rounded-[12px] border p-3 text-left transition hover:-translate-y-0.5 hover:border-current/70 ${selected ? "border-current/70 bg-current/5 shadow-[inset_3px_0_0_hsl(var(--current))]" : "border-line bg-surface"}`} style={{ borderLeft: `4px solid ${period.color}` }} onClick={onClick}>
      <div className="text-[12px] text-muted">{formatZoned(period.startAtUtc, timezone, "h:mm a")}</div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-semibold">{period.title}</span>
          {active && <span className="rounded bg-current/10 px-2 py-0.5 text-[11px] text-current">now</span>}
        </div>
        <div className="mt-1 text-[12px] text-muted">{formatZoned(period.startAtUtc, timezone, "h:mm a")} - {formatZoned(period.endAtUtc, timezone, "h:mm a")} - {period.linkedTaskCount} tasks</div>
      </div>
    </button>
  );
}

function ContextPanel({ selection, tasks, periods, taskTypes, timezone }: { selection: ContextSelection | null; tasks: Task[]; periods: TimePeriod[]; taskTypes: TaskType[]; timezone: string }) {
  const linkedPeriods = selection?.type === "task" ? selection.item.linkedPeriodIds.map((id) => periods.find((period) => basePeriodID(period.id) === id)).filter((period): period is TimePeriod => Boolean(period)) : [];
  const linkedTasks = selection?.type === "period" ? tasks.filter((task) => task.linkedPeriodIds.includes(basePeriodID(selection.item.id))) : [];
  return (
    <aside className="scroll-smooth-ui min-h-0 overflow-auto rounded-[14px] border border-line bg-panel p-4 shadow-panel">
      <h2 className="text-[16px] font-semibold">Context</h2>
      {!selection ? (
        <p className="mt-2 text-[13px] text-muted">Select a task or timeline item to inspect full details.</p>
      ) : selection.type === "task" ? (
        <DetailCard
          title={selection.item.title}
          meta={`${selection.item.priority} priority - ${selection.item.status}`}
            rows={[
              ["Type", taskTypes.find((type) => type.id === selection.item.typeId)?.name ?? "No type"],
              ["Due", selection.item.dueAtUtc ? formatZoned(selection.item.dueAtUtc, timezone, "EEE, MMM d, h:mm a") : "No due date"],
              ["Created", formatZoned(selection.item.createdAtUtc, timezone, "MMM d, h:mm a")]
            ]}
          content={selection.item.content ?? "No content added yet."}
          relatedTitle="Linked periods"
          related={linkedPeriods.map((period) => `${formatZoned(period.startAtUtc, timezone, "h:mm a")} ${period.title}`)}
        />
      ) : (
        <DetailCard
          title={selection.item.title}
          meta={`${formatZoned(selection.item.startAtUtc, timezone, "h:mm a")} - ${formatZoned(selection.item.endAtUtc, timezone, "h:mm a")} - ${selection.item.category}`}
          rows={[
            ["Status", selection.item.status],
            ["Timezone", selection.item.sourceTimezone]
          ]}
          content={selection.item.description ?? selection.item.notes ?? "No details added yet."}
          relatedTitle="Linked tasks"
          related={linkedTasks.map((task) => `${task.priority}: ${task.title}`)}
        />
      )}
    </aside>
  );
}

function DetailCard({ title, meta, rows, content, relatedTitle, related }: { title: string; meta: string; rows: Array<[string, string]>; content: string; relatedTitle: string; related: string[] }) {
  return (
    <div className="mt-4 rounded-[12px] border border-line bg-surface p-4">
      <div className="text-[12px] uppercase text-muted">{meta}</div>
      <h3 className="mt-2 break-words text-[18px] font-semibold leading-6">{title}</h3>
      <dl className="mt-4 space-y-3 text-[13px]">
        {rows.map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-t border-line pt-3"><dt className="text-muted">{label}</dt><dd className="text-right text-ink">{value}</dd></div>)}
      </dl>
      <div className="scroll-smooth-ui mt-4 max-h-56 overflow-auto whitespace-pre-line break-words rounded-[10px] border border-line bg-panel p-3 text-[13px] leading-5 text-muted">{content}</div>
      <h4 className="mt-4 text-[12px] font-semibold uppercase text-muted">{relatedTitle}</h4>
      <div className="mt-2 space-y-2">
        {related.map((item) => <div key={item} className="rounded-[10px] border border-line bg-panel px-3 py-2 text-[13px]">{item}</div>)}
        {!related.length && <div className="rounded-[10px] border border-dashed border-line px-3 py-2 text-[13px] text-muted">Nothing linked yet.</div>}
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <section className="min-h-0 rounded-[14px] border border-line bg-panel p-4 shadow-panel"><div className="mb-3"><h3 className="text-[16px] font-semibold">{title}</h3><p className="text-[12px] text-muted">{subtitle}</p></div>{children}</section>;
}

function ActionButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className="focus-ring inline-flex items-center gap-2 rounded-[10px] border border-line px-3 py-2 text-[13px] hover:bg-surface" onClick={onClick}>{children}</button>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-[14px] border border-line bg-panel p-4 shadow-panel"><div className="flex items-center gap-2 text-[12px] text-muted">{icon}{label}</div><div className="mt-2 text-[24px] font-semibold">{value}</div></div>;
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="shrink-0 rounded bg-panel px-2 py-0.5 text-[11px] text-muted">{children}</span>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-[12px] border border-dashed border-line p-4 text-[13px] text-muted">{children}</div>;
}

function priorityRank(priority: Task["priority"]) {
  return { urgent: 0, high: 1, medium: 2, low: 3, none: 4 }[priority];
}

function priorityClass(priority: Task["priority"]) {
  if (priority === "urgent") return "bg-urgent/10 text-urgent";
  if (priority === "high") return "bg-orange-500/15 text-orange-300";
  if (priority === "medium") return "bg-current/10 text-current";
  if (priority === "low") return "bg-green-500/10 text-green-300";
  return "bg-surface text-muted";
}

function isTodayTask(task: Task, todayPeriods: TimePeriod[], now: Date, timezone: string) {
  if (task.dueAtUtc && sameZonedDay(task.dueAtUtc, now, timezone)) return true;
  if (task.linkedPeriodIds.some((id) => todayPeriods.some((period) => basePeriodID(period.id) === id))) return true;
  return false;
}

function taskTimeRank(task: Task, todayPeriods: TimePeriod[]) {
  if (task.dueAtUtc) return Date.parse(task.dueAtUtc);
  const linked = task.linkedPeriodIds.map((id) => todayPeriods.find((period) => basePeriodID(period.id) === id)).find(Boolean);
  return linked ? Date.parse(linked.startAtUtc) : Number.MAX_SAFE_INTEGER;
}

function basePeriodID(id: string) {
  return id.split("#occ#")[0];
}

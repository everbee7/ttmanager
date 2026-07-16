import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getSnapshot } from "@/lib/api";
import type { Task, TimePeriod } from "@shared/contracts";
import { formatZoned, zonedDayBoundsUtc } from "@/lib/datetime";

type HistoryKind = "all" | "tasks" | "periods" | "notifications";
type CompletionFilter = "all" | "completed" | "skipped" | "overdue" | "sent";

export function HistoryPage() {
  const { data } = useQuery({ queryKey: ["snapshot"], queryFn: getSnapshot });
  const [kind, setKind] = useState<HistoryKind>("all");
  const [state, setState] = useState<CompletionFilter>("all");
  const [priority, setPriority] = useState("all");
  const [typeId, setTypeId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const timezone = data?.settings.defaultTimezone ?? "America/Denver";

  const tasks = useMemo(() => filterTasks(data?.tasks ?? [], { state, priority, typeId, from, to, timezone }), [data?.tasks, state, priority, typeId, from, to, timezone]);
  const periods = useMemo(() => filterPeriods(data?.periods ?? [], { state, from, to, timezone }), [data?.periods, state, from, to, timezone]);
  const notifications = useMemo(() => (data?.notificationHistory ?? []).filter((event) => inDateRange(event.sentAtUtc, from, to, timezone) && (state === "all" || state === "sent")), [data?.notificationHistory, from, to, state, timezone]);
  const showTasks = kind === "all" || kind === "tasks";
  const showPeriods = kind === "all" || kind === "periods";
  const showNotifications = kind === "all" || kind === "notifications";

  return (
    <div className="h-full overflow-auto p-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold">History</h1>
          <p className="text-[13px] text-muted">Review completed work, skipped periods, overdue tasks, and notification events.</p>
        </div>
      </div>
      <section className="mt-5 rounded-[14px] border border-line bg-panel p-4 shadow-panel">
        <div className="grid grid-cols-6 gap-3">
          <Field label="Show"><select className="input" value={kind} onChange={(event) => setKind(event.target.value as HistoryKind)}>{["all", "tasks", "periods", "notifications"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></Field>
          <Field label="State"><select className="input" value={state} onChange={(event) => setState(event.target.value as CompletionFilter)}>{["all", "completed", "skipped", "overdue", "sent"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></Field>
          <Field label="Priority"><select className="input" value={priority} onChange={(event) => setPriority(event.target.value)}>{["all", "urgent", "high", "medium", "low", "none"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></Field>
          <Field label="Task type"><select className="input" value={typeId} onChange={(event) => setTypeId(event.target.value)}><option value="all">All</option><option value="none">No type</option>{(data?.taskTypes ?? []).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></Field>
          <Field label="From"><input className="input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
          <Field label="To"><input className="input" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
        </div>
      </section>
      <div className="mt-4 grid grid-cols-3 gap-4">
        {showTasks && <HistoryPanel title="Tasks" empty="Completed and overdue tasks will appear here.">{tasks.map((task) => <TaskRow key={task.id} task={task} timezone={timezone} />)}</HistoryPanel>}
        {showPeriods && <HistoryPanel title="Periods" empty="Completed or skipped periods will appear here.">{periods.map((period) => <PeriodRow key={period.id} period={period} timezone={timezone} />)}</HistoryPanel>}
        {showNotifications && (
          <HistoryPanel title="Notifications" empty="Notification events will appear here after reminders are sent.">
            {notifications.map((event) => (
              <div key={event.id} className="border-b border-line py-2 last:border-0">
                <div className="font-medium">{event.title}</div>
                <div className="text-[12px] text-muted">{formatZoned(event.sentAtUtc, timezone, "MMM d, h:mm a")} - {label(event.ownerType)} - {label(event.eventType)}</div>
              </div>
            ))}
          </HistoryPanel>
        )}
      </div>
    </div>
  );
}

function filterTasks(tasks: Task[], filters: { state: CompletionFilter; priority: string; typeId: string; from: string; to: string; timezone: string }) {
  return tasks.filter((task) => {
    const overdue = task.status !== "completed" && task.dueAtUtc && Date.parse(task.dueAtUtc) < Date.now();
    if (filters.state === "completed" && task.status !== "completed") return false;
    if (filters.state === "overdue" && !overdue) return false;
    if (filters.state === "skipped" || filters.state === "sent") return false;
    if (filters.priority !== "all" && task.priority !== filters.priority) return false;
    if (filters.typeId === "none" && task.typeId) return false;
    if (filters.typeId !== "all" && filters.typeId !== "none" && task.typeId !== filters.typeId) return false;
    return inDateRange(task.dueAtUtc ?? task.updatedAtUtc, filters.from, filters.to, filters.timezone);
  });
}

function filterPeriods(periods: TimePeriod[], filters: { state: CompletionFilter; from: string; to: string; timezone: string }) {
  return periods.filter((period) => {
    if (filters.state === "completed" && period.status !== "completed") return false;
    if (filters.state === "skipped" && period.status !== "skipped") return false;
    if (filters.state === "overdue" || filters.state === "sent") return false;
    if (filters.state === "all" && period.status !== "completed" && period.status !== "skipped") return false;
    return inDateRange(period.startAtUtc, filters.from, filters.to, filters.timezone);
  });
}

function inDateRange(value: string, from: string, to: string, timezone: string) {
  const time = Date.parse(value);
  if (from && time < Date.parse(zonedDayBoundsUtc(new Date(`${from}T00:00:00`), timezone).startUtc)) return false;
  if (to && time > Date.parse(zonedDayBoundsUtc(new Date(`${to}T00:00:00`), timezone).endUtc)) return false;
  return true;
}

function TaskRow({ task, timezone }: { task: Task; timezone: string }) {
  return <div className="border-b border-line py-2 last:border-0"><div className="font-medium">{task.title}</div><div className="text-[12px] text-muted">{task.status} - {task.priority}{task.dueAtUtc ? ` - ${formatZoned(task.dueAtUtc, timezone, "MMM d, h:mm a")}` : ""}</div></div>;
}

function PeriodRow({ period, timezone }: { period: TimePeriod; timezone: string }) {
  return <div className="border-b border-line py-2 last:border-0"><div className="font-medium">{period.title}</div><div className="text-[12px] text-muted">{formatZoned(period.startAtUtc, timezone, "MMM d, h:mm a")} - {period.status}</div></div>;
}

function HistoryPanel({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return <section className="rounded-[14px] border border-line bg-panel p-4 shadow-panel"><h2 className="mb-3 text-[16px] font-semibold">{title}</h2>{children.length ? children : <p className="text-[13px] text-muted">{empty}</p>}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-[13px] font-medium text-muted"><span className="mb-1 block">{label}</span>{children}</label>;
}

function label(value: string) {
  return value.split("_").map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" ");
}

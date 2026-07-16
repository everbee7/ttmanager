import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, isSameDay, startOfMonth, startOfWeek } from "date-fns";
import { useMemo, useState } from "react";
import { deletePeriod, deleteTask, getSnapshot } from "@/lib/api";
import { Trash2 } from "lucide-react";
import { formatZoned, sameZonedDay, zonedDateKey, zonedNow } from "@/lib/datetime";

export function CalendarPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["snapshot"], queryFn: getSnapshot });
  const removePeriod = useMutation({ mutationFn: ({ id, scope }: { id: string; scope?: "this" | "following" | "series" }) => deletePeriod(id, scope), onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshot"] }) });
  const removeTask = useMutation({ mutationFn: deleteTask, onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshot"] }) });
  const [selected, setSelected] = useState(new Date());
  const monthStart = startOfMonth(selected);
  const gridStart = startOfWeek(monthStart);
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => addDays(gridStart, index)), [gridStart]);
  const periods = data?.periods ?? [];
  const tasks = data?.tasks ?? [];
  const timezone = data?.settings.defaultTimezone ?? "America/Denver";
  const todayKey = zonedDateKey(new Date(), timezone);
  const selectedPeriods = periods.filter((period) => sameZonedDay(period.startAtUtc, selected, timezone));
  const selectedTasks = tasks.filter((task) => task.dueAtUtc && sameZonedDay(task.dueAtUtc, selected, timezone));
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_360px] gap-4 p-5">
      <section className="scroll-smooth-ui min-h-0 overflow-auto rounded-[14px] border border-line bg-panel p-4 shadow-panel">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-[26px] font-semibold">{format(selected, "MMMM yyyy")}</h1>
          <button className="rounded-[10px] border border-line px-3 py-2 hover:bg-surface" onClick={() => setSelected(zonedNow(timezone))}>Today</button>
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[12px] border border-line bg-line">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="bg-surface px-3 py-2 text-[12px] text-muted">{day}</div>)}
          {days.map((day) => {
            const dayPeriods = periods.filter((period) => sameZonedDay(period.startAtUtc, day, timezone));
            const dayTasks = tasks.filter((task) => task.dueAtUtc && sameZonedDay(task.dueAtUtc, day, timezone));
            const today = format(day, "yyyy-MM-dd") === todayKey;
            return (
              <button key={day.toISOString()} className={`relative min-h-28 bg-panel p-2 text-left hover:bg-surface ${isSameDay(day, selected) ? "ring-2 ring-inset ring-accent" : ""} ${today ? "bg-current/10 shadow-[inset_0_0_0_1px_rgba(245,158,11,.7),0_0_24px_rgba(245,158,11,.16)]" : ""} ${day.getMonth() !== monthStart.getMonth() ? "opacity-45" : ""}`} onClick={() => setSelected(day)}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[13px] font-semibold ${today ? "bg-accent text-white" : ""}`}>{format(day, "d")}</span>
                  {today && <span className="rounded bg-urgent px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Today</span>}
                </div>
                <div className="mt-2 space-y-1">
                  {dayPeriods.slice(0, 2).map((period) => <div key={period.id} className="truncate rounded px-2 py-1 text-[11px] text-white" style={{ backgroundColor: period.color }}>{period.title}</div>)}
                  {dayTasks.slice(0, 2).map((task) => <div key={task.id} className="truncate rounded bg-surface px-2 py-1 text-[11px]">{task.title}</div>)}
                </div>
              </button>
            );
          })}
        </div>
      </section>
      <aside className="scroll-smooth-ui min-h-0 overflow-auto rounded-[14px] border border-line bg-panel p-4 shadow-panel">
        <h2 className="border-b border-line pb-4 text-[18px] font-semibold">{format(selected, "EEEE, MMM d")}</h2>
        <h3 className="mt-5 text-[13px] font-semibold uppercase text-muted">Periods</h3>
        <div className="mt-2 space-y-2">
          {selectedPeriods.map((period) => (
            <div key={period.id} className="rounded-[10px] border border-line p-3" style={{ borderLeft: `4px solid ${period.color}` }}>
              <div className="flex min-w-0 items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{period.title}</div>
                  <div className="text-[12px] text-muted">{formatZoned(period.startAtUtc, timezone, "h:mm a")} - {formatZoned(period.endAtUtc, timezone, "h:mm a")}</div>
                </div>
                <button className="focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-muted hover:bg-urgent/10 hover:text-urgent" onClick={() => removePeriod.mutate({ id: period.id, scope: deleteScopeForPeriod(period) })} aria-label={`Delete ${period.title}`}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
          {!selectedPeriods.length && <p className="text-[13px] text-muted">No time periods planned for this day.</p>}
        </div>
        <h3 className="mt-5 text-[13px] font-semibold uppercase text-muted">Due tasks</h3>
        <div className="mt-2 space-y-2">
          {selectedTasks.map((task) => (
            <div key={task.id} className="rounded-[10px] border border-line p-3">
              <div className="flex min-w-0 items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{task.title}</div>
                  <div className="text-[12px] text-muted">{task.priority}</div>
                </div>
                <button className="focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-muted hover:bg-urgent/10 hover:text-urgent" onClick={() => removeTask.mutate(task.id)} aria-label={`Delete ${task.title}`}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
          {!selectedTasks.length && <p className="text-[13px] text-muted">No tasks due on this day.</p>}
        </div>
      </aside>
    </div>
  );
}

function deleteScopeForPeriod(period: { id: string; recurrenceRule: unknown }): "this" | "following" | "series" {
  if (!period.recurrenceRule || !period.id.includes("#occ#")) return "series";
  const choice = window.prompt("Delete repeating period:\n1 = This timeline\n2 = This and following timelines\n3 = All timelines", "1");
  if (choice === "2") return "following";
  if (choice === "3") return "series";
  return "this";
}

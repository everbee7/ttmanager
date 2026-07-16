import { useQuery } from "@tanstack/react-query";
import { differenceInMinutes } from "date-fns";
import { getSnapshot } from "@/lib/api";

export function ReportsPage() {
  const { data } = useQuery({ queryKey: ["snapshot"], queryFn: getSnapshot });
  const periods = data?.periods ?? [];
  const tasks = data?.tasks ?? [];
  const plannedMinutes = periods.reduce((sum, period) => sum + Math.max(0, differenceInMinutes(new Date(period.endAtUtc), new Date(period.startAtUtc))), 0);
  const completedTasks = tasks.filter((task) => task.status === "completed").length;
  const overdueTasks = tasks.filter((task) => task.status !== "completed" && task.dueAtUtc && Date.parse(task.dueAtUtc) < Date.now()).length;
  const byCategory = periods.reduce<Record<string, number>>((acc, period) => {
    acc[period.category] = (acc[period.category] ?? 0) + Math.max(0, differenceInMinutes(new Date(period.endAtUtc), new Date(period.startAtUtc)));
    return acc;
  }, {});
  return (
    <div className="h-full overflow-auto p-5">
      <h1 className="text-[26px] font-semibold">Reports</h1>
      <div className="mt-5 grid grid-cols-4 gap-4">
        <Metric label="Planned time" value={`${Math.round(plannedMinutes / 60)}h`} />
        <Metric label="Completed tasks" value={String(completedTasks)} />
        <Metric label="Overdue tasks" value={String(overdueTasks)} />
        <Metric label="Completion rate" value={`${tasks.length ? Math.round(completedTasks / tasks.length * 100) : 0}%`} />
      </div>
      <section className="mt-4 rounded-[14px] border border-line bg-panel p-4 shadow-panel">
        <h2 className="mb-4 text-[16px] font-semibold">Time by category</h2>
        {Object.entries(byCategory).map(([category, minutes]) => (
          <div key={category} className="mb-3">
            <div className="mb-1 flex justify-between text-[13px]"><span>{category}</span><span>{Math.round(minutes / 60 * 10) / 10}h</span></div>
            <div className="h-2 rounded-full bg-line"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, minutes / Math.max(1, plannedMinutes) * 100)}%` }} /></div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[14px] border border-line bg-panel p-4 shadow-panel"><div className="text-[12px] text-muted">{label}</div><div className="mt-2 text-[24px] font-semibold">{value}</div></div>;
}

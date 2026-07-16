import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backupData, clearData, createTaskType, deleteTaskType, exportData, getSnapshot, restoreData, updateSettings, updateTaskType } from "@/lib/api";
import { useEffect, useState } from "react";
import type { AppSettings, TaskType } from "@shared/contracts";
import { timezones } from "@/lib/timezones";
import { Trash2 } from "lucide-react";

export function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["snapshot"], queryFn: getSnapshot });
  const [exportPath, setExportPath] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const save = useMutation({ mutationFn: updateSettings, onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshot"] }) });
  const addType = useMutation({ mutationFn: createTaskType, onSuccess: () => { setNewTypeName(""); qc.invalidateQueries({ queryKey: ["snapshot"] }); } });
  const saveType = useMutation({ mutationFn: updateTaskType, onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshot"] }) });
  const removeType = useMutation({ mutationFn: deleteTaskType, onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshot"] }) });
  const exportMutation = useMutation({ mutationFn: exportData, onSuccess: setExportPath });
  const backupMutation = useMutation({ mutationFn: backupData, onSuccess: setExportPath });
  const restoreMutation = useMutation({ mutationFn: restoreData, onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshot"] }) });
  const clearMutation = useMutation({ mutationFn: clearData, onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshot"] }) });
  const settings = data?.settings;
  const [timeDraft, setTimeDraft] = useState<Pick<AppSettings, "defaultTimezone" | "snapIntervalMinutes" | "timeFormat">>({
    defaultTimezone: "America/Denver",
    snapIntervalMinutes: 15,
    timeFormat: "12h"
  });
  useEffect(() => {
    if (!settings) return;
    setTimeDraft({
      defaultTimezone: settings.defaultTimezone,
      snapIntervalMinutes: settings.snapIntervalMinutes,
      timeFormat: settings.timeFormat
    });
  }, [settings?.defaultTimezone, settings?.snapIntervalMinutes, settings?.timeFormat]);
  const timeChanged = Boolean(settings && (
    timeDraft.defaultTimezone !== settings.defaultTimezone ||
    timeDraft.snapIntervalMinutes !== settings.snapIntervalMinutes ||
    timeDraft.timeFormat !== settings.timeFormat
  ));
  return (
    <div className="h-full overflow-auto p-5">
      <h1 className="text-[26px] font-semibold">Settings</h1>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <Panel title="General">
          <Toggle label="Start with Windows" checked={!!settings?.startWithWindows} onChange={(value) => save.mutate({ startWithWindows: value })} />
          <Toggle label="Minimize to tray" checked={settings?.minimizeToTray !== false} onChange={(value) => save.mutate({ minimizeToTray: value })} />
          <Toggle label="Close button hides to tray" checked={settings?.closeToTray !== false} onChange={(value) => save.mutate({ closeToTray: value })} />
        </Panel>
        <Panel title="Appearance">
          <label className="block text-[13px] text-muted">Theme</label>
          <select className="input mt-1" value={settings?.theme ?? "system"} onChange={(e) => save.mutate({ theme: e.target.value as "light" | "dark" | "system" })}>
            <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </Panel>
        <Panel title="Time">
          <label className="block text-[13px] text-muted">Default timezone</label>
          <select className="input mt-1" value={timeDraft.defaultTimezone} onChange={(e) => setTimeDraft({ ...timeDraft, defaultTimezone: e.target.value })}>
            {timezones.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
          </select>
          <label className="mt-3 block text-[13px] text-muted">Snap interval</label>
          <select className="input mt-1" value={timeDraft.snapIntervalMinutes} onChange={(e) => setTimeDraft({ ...timeDraft, snapIntervalMinutes: Number(e.target.value) as 5 | 10 | 15 | 30 | 60 })}>
            {[5, 10, 15, 30, 60].map((value) => <option key={value} value={value}>{value} minutes</option>)}
          </select>
          <label className="mt-3 block text-[13px] text-muted">Format</label>
          <select className="input mt-1" value={timeDraft.timeFormat} onChange={(e) => setTimeDraft({ ...timeDraft, timeFormat: e.target.value as "12h" | "24h" })}>
            <option value="12h">12-hour time</option>
            <option value="24h">24-hour time</option>
          </select>
          <div className="mt-4 flex items-center gap-3">
            <button
              className="focus-ring rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!timeChanged || save.isPending}
              onClick={() => save.mutate(timeDraft)}
            >
              Save time settings
            </button>
            {save.isPending && <span className="text-[12px] text-muted">Saving...</span>}
            {timeChanged && !save.isPending && <span className="text-[12px] text-current">Unsaved changes</span>}
          </div>
        </Panel>
        <Panel title="Notifications">
          <Toggle label="Enable notifications" checked={settings?.notificationsEnabled !== false} onChange={(value) => save.mutate({ notificationsEnabled: value })} />
          <Toggle label="Period-start notifications" checked={settings?.periodNotifications !== false} onChange={(value) => save.mutate({ periodNotifications: value })} />
          <Toggle label="Task reminders" checked={settings?.taskNotifications !== false} onChange={(value) => save.mutate({ taskNotifications: value })} />
          <Toggle label="Quiet hours" checked={!!settings?.quietHoursEnabled} onChange={(value) => save.mutate({ quietHoursEnabled: value })} />
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[13px] text-muted">Quiet start<input className="input mt-1" type="time" value={settings?.quietHoursStart ?? "22:00"} onChange={(event) => save.mutate({ quietHoursStart: event.target.value })} /></label>
            <label className="block text-[13px] text-muted">Quiet end<input className="input mt-1" type="time" value={settings?.quietHoursEnd ?? "07:00"} onChange={(event) => save.mutate({ quietHoursEnd: event.target.value })} /></label>
          </div>
          <label className="mt-3 block text-[13px] text-muted">Default snooze</label>
          <select className="input mt-1" value={settings?.defaultSnoozeMinutes ?? 15} onChange={(event) => save.mutate({ defaultSnoozeMinutes: Number(event.target.value) })}>
            {[5, 10, 15, 30, 60].map((value) => <option key={value} value={value}>{value} minutes</option>)}
          </select>
        </Panel>
        <Panel title="Task Types">
          <div className="space-y-2">
            {(data?.taskTypes ?? []).map((type) => <TaskTypeRow key={type.id} type={type} onSave={(payload) => saveType.mutate(payload)} onDelete={(id) => removeType.mutate(id)} />)}
          </div>
          <form className="mt-3 flex gap-2" onSubmit={(event) => {
            event.preventDefault();
            if (newTypeName.trim()) addType.mutate({ name: newTypeName.trim(), color: "#2563eb", icon: "tag" });
          }}>
            <input className="input" value={newTypeName} onChange={(event) => setNewTypeName(event.target.value)} placeholder="New task type" />
            <button className="rounded-[10px] bg-ink px-3 py-2 text-white">Add</button>
          </form>
          {(addType.isError || saveType.isError || removeType.isError) && <p className="mt-3 text-[13px] text-urgent">Task type change failed. Check for duplicate names.</p>}
        </Panel>
        <Panel title="Data">
          <div className="flex gap-2">
            <button className="rounded-[10px] bg-ink px-3 py-2 text-white" onClick={() => exportMutation.mutate("json")}>Export JSON</button>
            <button className="rounded-[10px] border border-line px-3 py-2 hover:bg-surface" onClick={() => exportMutation.mutate("csv")}>Export CSV</button>
            <button className="rounded-[10px] border border-line px-3 py-2 hover:bg-surface" onClick={() => backupMutation.mutate()}>Backup DB</button>
          </div>
          <button className="mt-3 rounded-[10px] border border-line px-3 py-2 hover:bg-surface" onClick={async () => {
            const path = await window.tt?.chooseRestoreFile?.();
            if (path) restoreMutation.mutate(path);
          }} disabled={!window.tt?.chooseRestoreFile}>Restore from backup</button>
          <div className="mt-5 rounded-[12px] border border-urgent/30 bg-urgent/10 p-3">
            <div className="text-[13px] font-semibold text-urgent">Format data</div>
            <p className="mt-1 text-[12px] leading-5 text-muted">Clear all tasks, periods, reminders, history, templates, and recurrence data. Settings and task types stay available.</p>
            <button className="mt-3 rounded-[10px] bg-urgent px-3 py-2 text-white hover:bg-urgent/90" onClick={() => {
              if (window.confirm("Format app data?\n\nThis clears tasks, periods, reminders, history, templates, and recurrence data.")) clearMutation.mutate();
            }}>Format data</button>
          </div>
          {exportPath && <p className="mt-3 break-all text-[13px] text-muted">Exported to {exportPath}</p>}
          {restoreMutation.isSuccess && <p className="mt-3 text-[13px] text-muted">Restore completed. A safety backup was created first.</p>}
          {restoreMutation.isError && <p className="mt-3 text-[13px] text-urgent">{(restoreMutation.error as Error).message}</p>}
          {clearMutation.isSuccess && <p className="mt-3 text-[13px] text-muted">Data formatted. Your app is empty now.</p>}
          {clearMutation.isError && <p className="mt-3 text-[13px] text-urgent">{(clearMutation.error as Error).message}</p>}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-[14px] border border-line bg-panel p-4 shadow-panel"><h2 className="mb-4 text-[16px] font-semibold">{title}</h2>{children}</section>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="mb-3 flex items-center justify-between gap-3 rounded-[12px] border border-line bg-surface px-3 py-2 text-[14px]">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`focus-ring relative h-6 w-11 shrink-0 rounded-full border transition ${checked ? "border-accent bg-accent" : "border-line bg-panel"}`}
        onClick={() => onChange(!checked)}
      >
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-ink shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </label>
  );
}

function TaskTypeRow({ type, onSave, onDelete }: { type: TaskType; onSave: (type: TaskType) => void; onDelete: (id: string) => void }) {
  const [draft, setDraft] = useState(type);
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)_84px_36px] items-center gap-2 rounded-[12px] border border-line p-2">
      <input aria-label={`${type.name} color`} type="color" className="h-7 w-7 rounded border border-line bg-surface p-0.5" value={draft.color} onChange={(event) => {
        const next = { ...draft, color: event.target.value };
        setDraft(next);
        onSave(next);
      }} />
      <input className="min-w-0 bg-transparent text-[13px] outline-none" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} onBlur={() => onSave(draft)} />
      <input className="min-w-0 rounded-[8px] border border-line bg-surface px-2 py-1 text-[12px] outline-none" value={draft.icon} onChange={(event) => setDraft({ ...draft, icon: event.target.value })} onBlur={() => onSave(draft)} />
      <button className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-urgent hover:bg-urgent/10" onClick={() => onDelete(type.id)} aria-label={`Delete ${type.name}`}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

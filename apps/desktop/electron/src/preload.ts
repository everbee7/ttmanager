import { contextBridge, ipcRenderer } from "electron";

type ApiRequest =
  | { type: "snapshot" }
  | { type: "task.create"; payload: unknown }
  | { type: "task.update"; payload: unknown }
  | { type: "task.complete"; payload: { id: string; completed: boolean } }
  | { type: "task.delete"; payload: { id: string } }
  | { type: "taskType.create"; payload: unknown }
  | { type: "taskType.update"; payload: unknown }
  | { type: "taskType.delete"; payload: { id: string } }
  | { type: "period.create"; payload: unknown }
  | { type: "period.update"; payload: unknown }
  | { type: "period.complete"; payload: { id: string } }
  | { type: "period.skip"; payload: { id: string } }
  | { type: "period.delete"; payload: { id: string; scope?: "this" | "following" | "series" } }
  | { type: "link.create"; payload: { taskId: string; periodId: string } }
  | { type: "link.delete"; payload: { taskId: string; periodId: string } }
  | { type: "settings.update"; payload: unknown }
  | { type: "data.export"; payload: { format: "json" | "csv" } }
  | { type: "data.backup"; payload: Record<string, never> }
  | { type: "data.restore"; payload: { path: string } }
  | { type: "data.clear"; payload: Record<string, never> }
  | { type: "reminders.snooze"; payload: { id: string; minutes: number } }
  | { type: "templates.list" }
  | { type: "templates.save"; payload: { name: string; date: string } }
  | { type: "templates.apply"; payload: { templateId: string; date: string } };
type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
type Snapshot = unknown;
type CreateTaskInput = unknown;
type CreatePeriodInput = unknown;

const invoke = <T>(request: ApiRequest): Promise<ApiResponse<T>> => ipcRenderer.invoke("api:request", request);

contextBridge.exposeInMainWorld("tt", {
  snapshot: () => invoke<Snapshot>({ type: "snapshot" }),
  createTask: (payload: CreateTaskInput) => invoke({ type: "task.create", payload }),
  updateTask: (payload: unknown) => invoke({ type: "task.update", payload }),
  completeTask: (id: string, completed: boolean) => invoke({ type: "task.complete", payload: { id, completed } }),
  deleteTask: (id: string) => invoke({ type: "task.delete", payload: { id } }),
  createTaskType: (payload: unknown) => invoke({ type: "taskType.create", payload }),
  updateTaskType: (payload: unknown) => invoke({ type: "taskType.update", payload }),
  deleteTaskType: (id: string) => invoke({ type: "taskType.delete", payload: { id } }),
  createPeriod: (payload: CreatePeriodInput) => invoke({ type: "period.create", payload }),
  updatePeriod: (payload: unknown) => invoke({ type: "period.update", payload }),
  completePeriod: (id: string) => invoke({ type: "period.complete", payload: { id } }),
  skipPeriod: (id: string) => invoke({ type: "period.skip", payload: { id } }),
  deletePeriod: (id: string, scope?: "this" | "following" | "series") => invoke({ type: "period.delete", payload: { id, scope } }),
  linkTaskPeriod: (taskId: string, periodId: string) => invoke({ type: "link.create", payload: { taskId, periodId } }),
  unlinkTaskPeriod: (taskId: string, periodId: string) => invoke({ type: "link.delete", payload: { taskId, periodId } }),
  updateSettings: (payload: unknown) => invoke({ type: "settings.update", payload }),
  exportData: (format: "json" | "csv") => invoke({ type: "data.export", payload: { format } }),
  backupData: () => invoke({ type: "data.backup", payload: {} }),
  restoreData: (path: string) => invoke({ type: "data.restore", payload: { path } }),
  clearData: () => invoke({ type: "data.clear", payload: {} }),
  chooseRestoreFile: () => ipcRenderer.invoke("dialog:chooseRestoreFile"),
  listTemplates: () => invoke({ type: "templates.list" }),
  saveTemplate: (name: string, date: string) => invoke({ type: "templates.save", payload: { name, date } }),
  applyTemplate: (templateId: string, date: string) => invoke({ type: "templates.apply", payload: { templateId, date } }),
  onNavigate: (handler: (path: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, path: string) => handler(path);
    ipcRenderer.on("app:navigate", listener);
    return () => ipcRenderer.removeListener("app:navigate", listener);
  },
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    close: () => ipcRenderer.send("window:close")
  }
});

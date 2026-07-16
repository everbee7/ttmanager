import { SnapshotSchema, type AppSettings, type CreateTaskInput, type CreatePeriodInput, type CreateTaskTypeInput, type DailyTemplate, type UpdatePeriodInput, type UpdateTaskInput, type UpdateTaskTypeInput } from "@shared/contracts";

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
type RpcRequest = { type: string; payload?: unknown };

const webToken = import.meta.env.VITE_TTMANAGER_DEV_TOKEN ?? "ttmanager-dev-token";

async function rpc<T>(request: RpcRequest): Promise<ApiResponse<T>> {
  if (window.tt) return electronRpc<T>(request);
  const response = await fetch("/rpc", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-session-token": webToken
    },
    body: JSON.stringify(request)
  });
  return response.json() as Promise<ApiResponse<T>>;
}

function electronRpc<T>(request: RpcRequest): Promise<ApiResponse<T>> {
  const tt = window.tt;
  if (!tt) return Promise.resolve({ ok: false, error: { code: "NO_ELECTRON_API", message: "Electron API is unavailable in browser mode." } });
  switch (request.type) {
    case "snapshot": return tt.snapshot() as Promise<ApiResponse<T>>;
    case "task.create": return tt.createTask(request.payload as CreateTaskInput) as Promise<ApiResponse<T>>;
    case "task.update": return tt.updateTask(request.payload as UpdateTaskInput) as Promise<ApiResponse<T>>;
    case "task.complete": {
      const payload = request.payload as { id: string; completed: boolean };
      return tt.completeTask(payload.id, payload.completed) as Promise<ApiResponse<T>>;
    }
    case "task.delete": return tt.deleteTask((request.payload as { id: string }).id) as Promise<ApiResponse<T>>;
    case "taskType.create": return tt.createTaskType(request.payload as CreateTaskTypeInput) as Promise<ApiResponse<T>>;
    case "taskType.update": return tt.updateTaskType(request.payload as UpdateTaskTypeInput) as Promise<ApiResponse<T>>;
    case "taskType.delete": return tt.deleteTaskType((request.payload as { id: string }).id) as Promise<ApiResponse<T>>;
    case "period.create": return tt.createPeriod(request.payload as CreatePeriodInput) as Promise<ApiResponse<T>>;
    case "period.update": return tt.updatePeriod(request.payload as UpdatePeriodInput) as Promise<ApiResponse<T>>;
    case "period.complete": return tt.completePeriod((request.payload as { id: string }).id) as Promise<ApiResponse<T>>;
    case "period.skip": return tt.skipPeriod((request.payload as { id: string }).id) as Promise<ApiResponse<T>>;
    case "period.delete": {
      const payload = request.payload as { id: string; scope?: "this" | "following" | "series" };
      return tt.deletePeriod(payload.id, payload.scope) as Promise<ApiResponse<T>>;
    }
    case "link.create": {
      const payload = request.payload as { taskId: string; periodId: string };
      return tt.linkTaskPeriod(payload.taskId, payload.periodId) as Promise<ApiResponse<T>>;
    }
    case "settings.update": return tt.updateSettings(request.payload as Partial<AppSettings>) as Promise<ApiResponse<T>>;
    case "data.export": return tt.exportData((request.payload as { format: "json" | "csv" }).format) as Promise<ApiResponse<T>>;
    case "data.backup": return tt.backupData() as Promise<ApiResponse<T>>;
    case "data.restore": return tt.restoreData((request.payload as { path: string }).path) as Promise<ApiResponse<T>>;
    case "data.clear": return tt.clearData() as Promise<ApiResponse<T>>;
    case "templates.list": return tt.listTemplates() as Promise<ApiResponse<T>>;
    case "templates.save": {
      const payload = request.payload as { name: string; date: string };
      return tt.saveTemplate(payload.name, payload.date) as Promise<ApiResponse<T>>;
    }
    case "templates.apply": {
      const payload = request.payload as { templateId: string; date: string };
      return tt.applyTemplate(payload.templateId, payload.date) as Promise<ApiResponse<T>>;
    }
    default: return Promise.resolve({ ok: false, error: { code: "UNKNOWN_RPC", message: `Unknown RPC request: ${request.type}` } });
  }
}

export async function getSnapshot() {
  const response = await rpc<unknown>({ type: "snapshot" });
  if (!response.ok) throw new Error(response.error.message);
  return SnapshotSchema.parse(response.data);
}

export async function createTask(input: CreateTaskInput) {
  const response = await rpc({ type: "task.create", payload: input });
  if (!response.ok) throw new Error(response.error.message);
}

export async function updateTask(input: UpdateTaskInput) {
  const response = await rpc({ type: "task.update", payload: input });
  if (!response.ok) throw new Error(response.error.message);
}

export async function completeTask(id: string, completed: boolean) {
  const response = await rpc({ type: "task.complete", payload: { id, completed } });
  if (!response.ok) throw new Error(response.error.message);
}

export async function deleteTask(id: string) {
  const response = await rpc({ type: "task.delete", payload: { id } });
  if (!response.ok) throw new Error(response.error.message);
}

export async function createTaskType(input: CreateTaskTypeInput) {
  const response = await rpc({ type: "taskType.create", payload: input });
  if (!response.ok) throw new Error(response.error.message);
}

export async function updateTaskType(input: UpdateTaskTypeInput) {
  const response = await rpc({ type: "taskType.update", payload: input });
  if (!response.ok) throw new Error(response.error.message);
}

export async function deleteTaskType(id: string) {
  const response = await rpc({ type: "taskType.delete", payload: { id } });
  if (!response.ok) throw new Error(response.error.message);
}

export async function createPeriod(input: CreatePeriodInput) {
  const response = await rpc({ type: "period.create", payload: input });
  if (!response.ok) throw new Error(response.error.message);
}

export async function updatePeriod(input: UpdatePeriodInput) {
  const response = await rpc({ type: "period.update", payload: input });
  if (!response.ok) throw new Error(response.error.message);
}

export async function completePeriod(id: string) {
  const response = await rpc({ type: "period.complete", payload: { id } });
  if (!response.ok) throw new Error(response.error.message);
}

export async function skipPeriod(id: string) {
  const response = await rpc({ type: "period.skip", payload: { id } });
  if (!response.ok) throw new Error(response.error.message);
}

export async function deletePeriod(id: string, scope?: "this" | "following" | "series") {
  const response = await rpc({ type: "period.delete", payload: { id, scope } });
  if (!response.ok) throw new Error(response.error.message);
}

export async function linkTaskPeriod(taskId: string, periodId: string) {
  const response = await rpc({ type: "link.create", payload: { taskId, periodId } });
  if (!response.ok) throw new Error(response.error.message);
}

export async function updateSettings(input: Partial<AppSettings>) {
  const response = await rpc({ type: "settings.update", payload: input });
  if (!response.ok) throw new Error(response.error.message);
}

export async function exportData(format: "json" | "csv") {
  const response = await rpc<{ path: string }>({ type: "data.export", payload: { format } });
  if (!response.ok) throw new Error(response.error.message);
  return response.data.path;
}

export async function backupData() {
  const response = await rpc<{ path: string }>({ type: "data.backup", payload: {} });
  if (!response.ok) throw new Error(response.error.message);
  return response.data.path;
}

export async function restoreData(path: string) {
  const response = await rpc({ type: "data.restore", payload: { path } });
  if (!response.ok) throw new Error(response.error.message);
}

export async function clearData() {
  const response = await rpc({ type: "data.clear", payload: {} });
  if (!response.ok) throw new Error(response.error.message);
}

export async function listTemplates(): Promise<DailyTemplate[]> {
  const response = await rpc<DailyTemplate[]>({ type: "templates.list" });
  if (!response.ok) throw new Error(response.error.message);
  return response.data;
}

export async function saveTemplate(name: string, date: string) {
  const response = await rpc({ type: "templates.save", payload: { name, date } });
  if (!response.ok) throw new Error(response.error.message);
}

export async function applyTemplate(templateId: string, date: string) {
  const response = await rpc({ type: "templates.apply", payload: { templateId, date } });
  if (!response.ok) throw new Error(response.error.message);
}

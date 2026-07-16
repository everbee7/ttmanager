/// <reference types="vite/client" />

import type { ApiResponse, CreatePeriodInput, CreateTaskInput, CreateTaskTypeInput, Snapshot, UpdatePeriodInput, UpdateTaskInput, UpdateTaskTypeInput } from "../../../../packages/shared-types/src/contracts";

declare global {
  interface Window {
    tt?: {
      snapshot: () => Promise<ApiResponse<Snapshot>>;
      createTask: (payload: CreateTaskInput) => Promise<ApiResponse<unknown>>;
      updateTask: (payload: UpdateTaskInput) => Promise<ApiResponse<unknown>>;
      completeTask: (id: string, completed: boolean) => Promise<ApiResponse<unknown>>;
      deleteTask: (id: string) => Promise<ApiResponse<unknown>>;
      createTaskType: (payload: CreateTaskTypeInput) => Promise<ApiResponse<unknown>>;
      updateTaskType: (payload: UpdateTaskTypeInput) => Promise<ApiResponse<unknown>>;
      deleteTaskType: (id: string) => Promise<ApiResponse<unknown>>;
      createPeriod: (payload: CreatePeriodInput) => Promise<ApiResponse<unknown>>;
      updatePeriod: (payload: UpdatePeriodInput) => Promise<ApiResponse<unknown>>;
      completePeriod: (id: string) => Promise<ApiResponse<unknown>>;
      skipPeriod: (id: string) => Promise<ApiResponse<unknown>>;
      deletePeriod: (id: string, scope?: "this" | "following" | "series") => Promise<ApiResponse<unknown>>;
      linkTaskPeriod: (taskId: string, periodId: string) => Promise<ApiResponse<unknown>>;
      unlinkTaskPeriod: (taskId: string, periodId: string) => Promise<ApiResponse<unknown>>;
      updateSettings: (payload: Partial<import("../../../../packages/shared-types/src/contracts").AppSettings>) => Promise<ApiResponse<unknown>>;
      exportData: (format: "json" | "csv") => Promise<ApiResponse<{ path: string }>>;
      backupData: () => Promise<ApiResponse<{ path: string }>>;
      restoreData: (path: string) => Promise<ApiResponse<unknown>>;
      clearData: () => Promise<ApiResponse<unknown>>;
      chooseRestoreFile: () => Promise<string | null>;
      listTemplates: () => Promise<ApiResponse<import("../../../../packages/shared-types/src/contracts").DailyTemplate[]>>;
      saveTemplate: (name: string, date: string) => Promise<ApiResponse<unknown>>;
      applyTemplate: (templateId: string, date: string) => Promise<ApiResponse<unknown>>;
      onNavigate: (handler: (path: string) => void) => () => void;
      window: { minimize: () => void; close: () => void };
    };
  }
}

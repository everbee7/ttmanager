import { z } from "zod";

export const PrioritySchema = z.enum(["urgent", "high", "medium", "low", "none"]);
export const TaskStatusSchema = z.enum(["open", "completed", "archived"]);
export const PeriodStatusSchema = z.enum(["planned", "active", "completed", "skipped"]);
export const RecurrenceFrequencySchema = z.enum(["none", "daily", "weekdays", "weekly", "monthly", "custom"]);
export const RecurrenceEditScopeSchema = z.enum(["this", "following", "series"]);

export const RecurrenceRuleSchema = z.object({
  id: z.string().optional(),
  ownerType: z.enum(["task", "period"]).optional(),
  ownerId: z.string().optional(),
  frequency: RecurrenceFrequencySchema,
  intervalCount: z.number().int().min(1).default(1),
  weekdays: z.array(z.number().int().min(0).max(6)).default([]),
  monthRule: z.string().nullable().default(null),
  startsOn: z.string().nullable().default(null),
  endsOn: z.string().nullable().default(null),
  occurrenceCount: z.number().int().min(1).nullable().default(null)
});

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  content: z.string().nullable().default(null),
  priority: PrioritySchema,
  typeId: z.string().nullable(),
  dueAtUtc: z.string().nullable(),
  status: TaskStatusSchema,
  linkedPeriodIds: z.array(z.string()),
  recurrenceRule: RecurrenceRuleSchema.nullable().default(null),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string()
});

export const TaskTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  icon: z.string()
});

export const CreateTaskTypeSchema = z.object({
  name: z.string().min(1),
  color: z.string().default("#2563eb"),
  icon: z.string().default("tag")
});

export const UpdateTaskTypeSchema = CreateTaskTypeSchema.partial().extend({
  id: z.string()
});

export const TimePeriodSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().nullable(),
  startAtUtc: z.string(),
  endAtUtc: z.string(),
  sourceTimezone: z.string(),
  category: z.string(),
  color: z.string(),
  status: PeriodStatusSchema,
  linkedTaskCount: z.number(),
  notes: z.string().nullable()
  ,
  recurrenceRule: RecurrenceRuleSchema.nullable().default(null)
});

export const AppSettingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  defaultTimezone: z.string(),
  startWithWindows: z.boolean(),
  minimizeToTray: z.boolean(),
  closeToTray: z.boolean(),
  snapIntervalMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30), z.literal(60)]),
  timeFormat: z.enum(["12h", "24h"]),
  notificationsEnabled: z.boolean(),
  periodNotifications: z.boolean(),
  taskNotifications: z.boolean(),
  quietHoursEnabled: z.boolean(),
  quietHoursStart: z.string(),
  quietHoursEnd: z.string(),
  defaultSnoozeMinutes: z.number().int().min(5)
});

export const CreateTaskSchema = z.object({
  title: z.string().min(1),
  content: z.string().nullable().default(null),
  priority: PrioritySchema.default("none"),
  typeId: z.string().nullable().default(null),
  dueAtUtc: z.string().nullable().default(null),
  linkedPeriodIds: z.array(z.string()).default([]),
  recurrenceRule: RecurrenceRuleSchema.nullable().default(null)
});

export const CreatePeriodSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().default(null),
  startAtUtc: z.string(),
  endAtUtc: z.string(),
  sourceTimezone: z.string(),
  category: z.string().default("Work"),
  color: z.string().default("#2563eb"),
  notes: z.string().nullable().default(null),
  recurrenceRule: RecurrenceRuleSchema.nullable().default(null)
});

export const UpdateTaskSchema = CreateTaskSchema.partial().extend({
  id: z.string(),
  recurrenceEditScope: RecurrenceEditScopeSchema.optional()
});

export const UpdatePeriodSchema = CreatePeriodSchema.partial().extend({
  id: z.string(),
  recurrenceEditScope: RecurrenceEditScopeSchema.optional()
});

export const LinkTaskPeriodSchema = z.object({
  taskId: z.string(),
  periodId: z.string()
});

export const NotificationHistorySchema = z.object({
  id: z.string(),
  ownerType: z.enum(["task", "period"]),
  ownerId: z.string(),
  title: z.string(),
  sentAtUtc: z.string(),
  eventType: z.string()
});

export const SnapshotSchema = z.object({
  nowUtc: z.string(),
  settings: AppSettingsSchema,
  taskTypes: z.array(TaskTypeSchema).nullish().transform((value) => value ?? []),
  tasks: z.array(TaskSchema).nullish().transform((value) => value ?? []),
  periods: z.array(TimePeriodSchema).nullish().transform((value) => value ?? []),
  notificationHistory: z.array(NotificationHistorySchema).nullish().transform((value) => value ?? [])
});

export const DailyTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  periodCount: z.number(),
  createdAtUtc: z.string()
});

export type Task = z.infer<typeof TaskSchema>;
export type TaskType = z.infer<typeof TaskTypeSchema>;
export type CreateTaskTypeInput = z.infer<typeof CreateTaskTypeSchema>;
export type UpdateTaskTypeInput = z.infer<typeof UpdateTaskTypeSchema>;
export type TimePeriod = z.infer<typeof TimePeriodSchema>;
export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;
export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type CreatePeriodInput = z.infer<typeof CreatePeriodSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type UpdatePeriodInput = z.infer<typeof UpdatePeriodSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type DailyTemplate = z.infer<typeof DailyTemplateSchema>;
export type NotificationHistory = z.infer<typeof NotificationHistorySchema>;

export type ApiRequest =
  | { type: "snapshot" }
  | { type: "task.create"; payload: CreateTaskInput }
  | { type: "task.update"; payload: UpdateTaskInput }
  | { type: "task.complete"; payload: { id: string; completed: boolean } }
  | { type: "task.delete"; payload: { id: string } }
  | { type: "taskType.create"; payload: CreateTaskTypeInput }
  | { type: "taskType.update"; payload: UpdateTaskTypeInput }
  | { type: "taskType.delete"; payload: { id: string } }
  | { type: "period.create"; payload: CreatePeriodInput }
  | { type: "period.update"; payload: UpdatePeriodInput }
  | { type: "period.complete"; payload: { id: string } }
  | { type: "period.skip"; payload: { id: string } }
  | { type: "period.delete"; payload: { id: string; scope?: "this" | "following" | "series" } }
  | { type: "link.create"; payload: z.infer<typeof LinkTaskPeriodSchema> }
  | { type: "link.delete"; payload: z.infer<typeof LinkTaskPeriodSchema> }
  | { type: "settings.update"; payload: Partial<AppSettings> }
  | { type: "data.export"; payload: { format: "json" | "csv" } }
  | { type: "data.backup"; payload: Record<string, never> }
  | { type: "data.restore"; payload: { path: string } }
  | { type: "data.clear"; payload: Record<string, never> }
  | { type: "reminders.snooze"; payload: { id: string; minutes: number } }
  | { type: "templates.list" }
  | { type: "templates.save"; payload: { name: string; date: string } }
  | { type: "templates.apply"; payload: { templateId: string; date: string } };

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

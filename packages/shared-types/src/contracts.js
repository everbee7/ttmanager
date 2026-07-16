import { z } from "zod";
export const PrioritySchema = z.enum(["urgent", "high", "medium", "low", "none"]);
export const TaskStatusSchema = z.enum(["open", "completed", "archived"]);
export const PeriodStatusSchema = z.enum(["planned", "active", "completed", "skipped"]);
export const TaskSchema = z.object({
    id: z.string(),
    title: z.string().min(1),
    content: z.string().nullable().default(null),
    priority: PrioritySchema,
    typeId: z.string().nullable(),
    dueAtUtc: z.string().nullable(),
    status: TaskStatusSchema,
    linkedPeriodIds: z.array(z.string()),
    createdAtUtc: z.string(),
    updatedAtUtc: z.string()
});
export const TaskTypeSchema = z.object({
    id: z.string(),
    name: z.string(),
    color: z.string(),
    icon: z.string()
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
});
export const AppSettingsSchema = z.object({
    theme: z.enum(["light", "dark", "system"]),
    defaultTimezone: z.string(),
    startWithWindows: z.boolean(),
    minimizeToTray: z.boolean(),
    closeToTray: z.boolean(),
    snapIntervalMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30), z.literal(60)]),
    timeFormat: z.enum(["12h", "24h"])
});
export const CreateTaskSchema = z.object({
    title: z.string().min(1),
    content: z.string().nullable().default(null),
    priority: PrioritySchema.default("none"),
    typeId: z.string().nullable().default(null),
    dueAtUtc: z.string().nullable().default(null),
    linkedPeriodIds: z.array(z.string()).default([])
});
export const CreatePeriodSchema = z.object({
    title: z.string().min(1),
    description: z.string().nullable().default(null),
    startAtUtc: z.string(),
    endAtUtc: z.string(),
    sourceTimezone: z.string(),
    category: z.string().default("Work"),
    color: z.string().default("#2563eb"),
    notes: z.string().nullable().default(null)
});
export const SnapshotSchema = z.object({
    nowUtc: z.string(),
    settings: AppSettingsSchema,
    taskTypes: z.array(TaskTypeSchema),
    tasks: z.array(TaskSchema),
    periods: z.array(TimePeriodSchema)
});

/**
 * Shared vocabulary for the app. Kept free of Prisma imports so it can be used
 * from client components and from the scheduler's unit tests.
 */

export const TASK_STATUSES = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "IN_REVIEW",
  "DONE",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Columns rendered on the Kanban board, in order. */
export const BOARD_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "BACKLOG", label: "Backlog" },
  { status: "TODO", label: "To do" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "BLOCKED", label: "Blocked" },
  { status: "IN_REVIEW", label: "In review" },
  { status: "DONE", label: "Done" },
];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  IN_REVIEW: "In review",
  DONE: "Done",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

/** A task is finished when it no longer consumes schedule. */
export function isComplete(status: TaskStatus): boolean {
  return status === "DONE";
}

export type HealthLevel = "ON_TRACK" | "AT_RISK" | "BEHIND";

export const HEALTH_LABEL: Record<HealthLevel, string> = {
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  BEHIND: "Behind schedule",
};

export const MS_PER_DAY = 86_400_000;

/** Whole days between two dates, ignoring time-of-day. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

export function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(d: Date, days: number): Date {
  const copy = startOfDay(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

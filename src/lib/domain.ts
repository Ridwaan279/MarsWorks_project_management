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

export const PROJECT_STAGES = [
  "INVESTIGATION",
  "DESIGN",
  "PROTOTYPE",
  "ORDER",
  "CONSTRUCTION",
  "TESTING",
  "IMPROVEMENT",
  "DOCUMENTATION",
] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];

/** Numbered the way the Electrical tracker writes them, so the labels are
 *  familiar to the team the vocabulary came from. */
export const STAGE_LABEL: Record<ProjectStage, string> = {
  INVESTIGATION: "1. Investigation",
  DESIGN: "2. Design",
  PROTOTYPE: "3. Prototype",
  ORDER: "4. Order",
  CONSTRUCTION: "5. Construction",
  TESTING: "6. Inspection & Testing",
  IMPROVEMENT: "7. Improvement",
  DOCUMENTATION: "8. Documentation",
};

export const STAGE_SHORT: Record<ProjectStage, string> = {
  INVESTIGATION: "Investigation",
  DESIGN: "Design",
  PROTOTYPE: "Prototype",
  ORDER: "Order",
  CONSTRUCTION: "Construction",
  TESTING: "Testing",
  IMPROVEMENT: "Improvement",
  DOCUMENTATION: "Documentation",
};

export type TeamView = "BOARD" | "TIMELINE";

/**
 * The last day of the MarsWorks season. The competition sits in spring 2027,
 * but the year runs to the September handover, so the timeline reaches there
 * even when no task does -- otherwise the chart appears to end mid-project.
 */
export const SEASON_END = new Date("2027-09-30T00:00:00Z");

/**
 * The first day the timeline will show. Work and planning before this date
 * belongs to the previous season; charting it only pushes the current year
 * off to the right. The chart is clamped here however far back a task's
 * planned start reaches.
 */
export const SEASON_START = new Date("2026-09-20T00:00:00Z");

/** A colour per lifecycle stage, drawn from the brand browns and the orange,
 *  so the stages read as one family rather than a rainbow. */
export const STAGE_COLOUR: Record<ProjectStage, string> = {
  INVESTIGATION: "#a6a7a7",
  DESIGN: "#c98a5b",
  PROTOTYPE: "#ab683e",
  ORDER: "#f87624",
  CONSTRUCTION: "#8c4b2c",
  TESTING: "#d9a13c",
  IMPROVEMENT: "#7fa662",
  DOCUMENTATION: "#61321f",
};

/**
 * Status words used by the planners this tool replaces, mapped onto ours.
 * The sync adapters and any spreadsheet import go through this table so the
 * same phrase always lands in the same column, whichever tool it came from.
 *
 * Sources: the master Google Sheet (Complete / In-Progress / Not Started /
 * Milestone), the Electrical dashboard (Done / In Progress / Not Started),
 * and the Robotics Jira board (Idea / To Do / In Progress / In Review / Done).
 *
 * "Milestone" is deliberately absent: those rows are a different kind of thing
 * and become Milestone records, not tasks.
 */
export const STATUS_ALIASES: Record<string, TaskStatus> = {
  idea: "BACKLOG",
  backlog: "BACKLOG",
  "not started": "TODO",
  "to do": "TODO",
  todo: "TODO",
  "in progress": "IN_PROGRESS",
  "in-progress": "IN_PROGRESS",
  started: "IN_PROGRESS",
  blocked: "BLOCKED",
  "in review": "IN_REVIEW",
  review: "IN_REVIEW",
  done: "DONE",
  complete: "DONE",
  completed: "DONE",
};

/** Resolve a status written in any of the team planners. */
export function normaliseStatus(raw: string | null | undefined): TaskStatus | null {
  if (!raw) return null;
  return STATUS_ALIASES[raw.trim().toLowerCase()] ?? null;
}

/**
 * Is this task part of what the team is working on right now?
 *
 * "Current" means either today falls inside the task's planned window, or the
 * task is unfinished and its end date has already passed. Work that is still
 * in the future is excluded, as is anything with no dates at all -- an undated
 * task has no window to be inside.
 *
 * Finished work inside the window still counts, so the Done column shows what
 * the team has just completed rather than sitting permanently empty.
 */
export function isCurrent(
  task: {
    status: TaskStatus;
    plannedStart: Date | string | null;
    plannedEnd: Date | string | null;
  },
  today: Date,
): boolean {
  const day = startOfDay(today).getTime();
  const start = task.plannedStart ? startOfDay(new Date(task.plannedStart)).getTime() : null;
  const end = task.plannedEnd ? startOfDay(new Date(task.plannedEnd)).getTime() : null;

  if (end !== null && end < day) return !isComplete(task.status);
  if (start !== null && start > day) return false;
  return start !== null || end !== null;
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

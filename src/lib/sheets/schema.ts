/**
 * The shape of the MarsWorks master timeline, as the Google Sheets sync sees it.
 *
 * The sheet has one tab per sub-team, each with the same six columns, plus a
 * "Website ID" column the sync adds so a row and a task can be matched even
 * after either is renamed. Milestones are rows in the Leadership tab whose
 * status is "Milestone".
 */
import type { TaskStatus } from "../domain";

/** Tab name -> sub-team key. Tabs not listed here are not synced. */
export const TAB_TEAM: Record<string, string> = {
  "Leadership and Milestones": "OPS",
  "Mech Tasks": "MECH",
  "Elec Tasks": "ELEC",
  "Robotics Tasks": "ROBO",
  "Sci Tasks": "SCI",
  "Software Tasks": "SW",
};

/** Where milestones created on the website are written. */
export const MILESTONE_TAB = "Leadership and Milestones";

/** The tab each sub-team's tasks are written to. */
export const TEAM_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_TEAM).map(([tab, team]) => [team, tab]),
);

/**
 * Website status -> the word shown in the sheet.
 *
 * Only the sheet's own three task words are used. Adding Blocked and In
 * Review to its Status dropdown from a script would replace the dropdown's
 * coloured chips with a plain list, since Apps Script cannot set chip colours.
 *
 * Nothing is lost by it. The sync compares in the sheet's vocabulary, so a
 * task Blocked on the website reads as "In-Progress" on both sides and is
 * left Blocked; only a different word typed in the sheet counts as a change.
 */
export const SHEET_STATUS: Record<TaskStatus, string> = {
  BACKLOG: "Not Started",
  TODO: "Not Started",
  IN_PROGRESS: "In-Progress",
  BLOCKED: "In-Progress",
  IN_REVIEW: "In-Progress",
  DONE: "Complete",
};

/** A sheet word -> the status to set on the website when that word is typed. */
export const STATUS_FROM_SHEET: Record<string, TaskStatus> = {
  "Not Started": "TODO",
  "In-Progress": "IN_PROGRESS",
  Complete: "DONE",
};

export const MILESTONE_STATUS = "Milestone";

/** The synced fields of a task row, all as the strings the sheet holds. */
export interface TaskFields {
  title: string;
  assignee: string;
  /** YYYY-MM-DD, or "" for no date. */
  start: string;
  end: string;
  /** One of the SHEET_STATUS words. */
  status: string;
  notes: string;
  /** Sub-team key, decided by which tab the row is in. */
  team: string;
}

export const TASK_FIELDS = [
  "title",
  "assignee",
  "start",
  "end",
  "status",
  "notes",
  "team",
] as const satisfies readonly (keyof TaskFields)[];

/** The synced fields of a milestone row. */
export interface MilestoneFields {
  name: string;
  /** YYYY-MM-DD. */
  date: string;
}

export const MILESTONE_FIELDS = ["name", "date"] as const satisfies readonly (keyof MilestoneFields)[];

/** One data row as the Apps Script reads it, before any interpretation. */
export interface SheetRow {
  /** 1-based row number in the tab, for writing an ID back to it. */
  row: number;
  id: string;
  title: string;
  assignee: string;
  /** "YYYY-MM-DD" when the cell held a date, otherwise its text. */
  start: string;
  end: string;
  status: string;
  notes: string;
}

export interface SheetTab {
  name: string;
  rows: SheetRow[];
}

/**
 * Values to write into a row, keyed by field. Only fields present are
 * written, so a milestone row never has its Assignee or Notes blanked, and
 * columns the sync does not know about are never touched.
 */
export type RowValues = Partial<
  Record<"title" | "assignee" | "start" | "end" | "status" | "notes", string>
>;

/**
 * An instruction to the Apps Script.
 *
 * upsert: find the row carrying `id` (in any tab), write `values` and `id`
 *   into it, moving it to `tab` if it is elsewhere. With `at`, a row without
 *   an ID yet is claimed first: the row at that number if its title still
 *   matches, else the first row in the tab with that title and no usable ID.
 *   With neither, the row is appended.
 * delete: remove every row carrying `id`.
 */
export type SheetOp =
  | {
      op: "upsert";
      id: string;
      tab: string;
      values: RowValues;
      at?: { row: number; title: string };
      /** Shown to sheet users as a note on the title cell. */
      note?: string;
    }
  | { op: "delete"; id: string };

/** Prefix that marks a milestone's Website ID, to keep it apart from task keys. */
export const MILESTONE_ID_PREFIX = "M:";

/** "Milestone: ARC Video Submissions Open" -> "ARC Video Submissions Open" */
export function milestoneName(title: string): string {
  return title.replace(/^\s*milestone\s*:\s*/i, "").trim();
}

export function milestoneTitle(name: string): string {
  return `Milestone: ${name}`;
}

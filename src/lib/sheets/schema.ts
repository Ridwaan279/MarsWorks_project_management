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
  "Drone Tasks": "DRONE",
  "Mini Tasks": "MINI",
};

/** Where milestones created on the website are written. */
export const MILESTONE_TAB = "Leadership and Milestones";

/** The tab each sub-team's tasks are written to. */
export const TEAM_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_TEAM).map(([tab, team]) => [team, tab]),
);

/** Website status -> word in the sheet. */
export type StatusVocabulary = Record<TaskStatus, string>;

/**
 * Every website status with a word of its own. Used once the sheet's Status
 * dropdowns offer all of them, which the sync script sets up.
 */
export const FULL_STATUS_WORDS: StatusVocabulary = {
  BACKLOG: "Backlog",
  TODO: "Not Started",
  IN_PROGRESS: "In-Progress",
  BLOCKED: "Blocked",
  IN_REVIEW: "In Review",
  DONE: "Complete",
};

/**
 * The sheet's original three task words. Used with a sheet whose dropdown has
 * not been extended yet, so the website never writes a word the dropdown
 * would reject. Nothing is lost meanwhile: comparisons happen in this
 * vocabulary, so a task Blocked on the website reads as "In-Progress" on both
 * sides and is left Blocked.
 */
export const BASIC_STATUS_WORDS: StatusVocabulary = {
  BACKLOG: "Not Started",
  TODO: "Not Started",
  IN_PROGRESS: "In-Progress",
  BLOCKED: "In-Progress",
  IN_REVIEW: "In-Progress",
  DONE: "Complete",
};

/**
 * The vocabulary to use with a sheet, from the status words its script says
 * the dropdowns accept. Each status gets its own word if that word is on
 * offer, else the basic one. An older script sends nothing, and gets basic.
 *
 * Switching is safe in either direction: words are compared in whichever
 * vocabulary is current, so a row showing the old word for an unchanged task
 * reads as "the website has the newer value", and is rewritten.
 */
export function statusVocabulary(options?: readonly string[]): StatusVocabulary {
  const offered = new Set((options ?? []).map((o) => o.trim().toLowerCase()));
  const result = { ...BASIC_STATUS_WORDS };
  for (const status of Object.keys(FULL_STATUS_WORDS) as TaskStatus[]) {
    if (offered.has(FULL_STATUS_WORDS[status].toLowerCase())) {
      result[status] = FULL_STATUS_WORDS[status];
    }
  }
  return result;
}

export const MILESTONE_STATUS = "Milestone";

/** The synced fields of a task row, all as the strings the sheet holds. */
export interface TaskFields {
  title: string;
  assignee: string;
  /** YYYY-MM-DD, or "" for no date. */
  start: string;
  end: string;
  /** A status word from the vocabulary in use; see statusVocabulary. */
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

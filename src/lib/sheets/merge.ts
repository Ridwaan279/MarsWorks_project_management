/**
 * Decide what a Google Sheets sync should change, on both sides.
 *
 * Pure: takes the sheet as read, the app's tasks and milestones, and returns a
 * plan. Nothing here touches the database or the network, which is what makes
 * the rules below testable one case at a time.
 *
 * ## How a change is attributed
 *
 * Each task stores `base`: the value of every synced field as last known to be
 * the same in the app and the sheet. Comparing each side to it says who moved:
 *
 *   sheet == app                -> nothing to do
 *   sheet == base, app != base  -> changed on the website; write it to the sheet
 *   app == base, sheet != base  -> changed in the sheet; write it to the website
 *   both differ from base       -> changed on both; the website wins, and the
 *                                  sheet row gets a note saying so
 *
 * Field by field, not row by row, so a status changed on the board and a note
 * typed in the sheet a minute later both survive.
 *
 * `base` only advances for a field once the sheet already holds the agreed
 * value. A write to the sheet that has been sent but not yet confirmed leaves
 * the old base in place, so if it never lands the next sync retries it rather
 * than mistaking the stale cell for an edit made in the sheet.
 */
import {
  MILESTONE_FIELDS,
  MILESTONE_ID_PREFIX,
  MILESTONE_STATUS,
  MILESTONE_TAB,
  BASIC_STATUS_WORDS,
  TAB_TEAM,
  TASK_FIELDS,
  TEAM_TAB,
  milestoneName,
  milestoneTitle,
  type MilestoneFields,
  type RowValues,
  type SheetOp,
  type SheetRow,
  type SheetTab,
  type StatusVocabulary,
  type TaskFields,
} from "./schema";
import { normaliseStatus } from "../domain";

export interface AppTask {
  id: string;
  key: string;
  fields: TaskFields;
  base: Partial<TaskFields> | null;
}

export interface AppMilestone {
  id: string;
  fields: MilestoneFields;
  base: Partial<MilestoneFields> | null;
}

export interface PlanInput {
  tabs: SheetTab[];
  tasks: AppTask[];
  milestones: AppMilestone[];
  /** Website IDs of things deleted on either side. */
  tombstones: ReadonlySet<string>;
  /** Status words the sheet uses; basic unless its script says otherwise. */
  vocabulary?: StatusVocabulary;
}

/** Where a row without an ID lives, so its new ID can be written back to it. */
export interface RowLocation {
  tab: string;
  row: number;
  title: string;
}

export interface Plan {
  /** Existing tasks: field changes for the website (may be empty) and the new base. */
  taskUpdates: { id: string; changes: Partial<TaskFields>; base: Partial<TaskFields> }[];
  taskCreates: { fields: TaskFields; base: Partial<TaskFields>; at: RowLocation }[];
  taskDeletes: { id: string; key: string }[];
  milestoneUpdates: {
    id: string;
    changes: Partial<MilestoneFields>;
    base: Partial<MilestoneFields>;
  }[];
  milestoneCreates: { fields: MilestoneFields; base: Partial<MilestoneFields>; at: RowLocation }[];
  milestoneDeletes: { id: string }[];
  /** Instructions for the sheet that do not depend on IDs created during apply. */
  ops: SheetOp[];
  conflicts: number;
  warnings: string[];
}

// --- reading cells -----------------------------------------------------------

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const UK = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;

function validDate(y: number, m: number, d: number): string | undefined {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * A date cell as YYYY-MM-DD, "" for an empty cell, or undefined when it cannot
 * be read. The Apps Script already turns real date cells into ISO; this is for
 * dates typed as text, which a UK team writes day first.
 */
export function readDate(raw: string): string | undefined {
  const text = raw.trim();
  if (text === "") return "";
  const iso = ISO.exec(text);
  if (iso) return validDate(+iso[1], +iso[2], +iso[3]);
  const uk = UK.exec(text);
  if (uk) {
    const year = uk[3].length === 2 ? 2000 + +uk[3] : +uk[3];
    return validDate(year, +uk[2], +uk[1]);
  }
  return undefined;
}

/**
 * A status cell in the vocabulary being compared, or undefined for a word the
 * website does not know. Typing any spelling ("in progress", "Done") counts.
 */
export function readStatus(
  raw: string,
  vocabulary: StatusVocabulary = BASIC_STATUS_WORDS,
): string | undefined {
  const text = raw.trim();
  if (text === "") return vocabulary.TODO;
  const status = normaliseStatus(text);
  return status ? vocabulary[status] : undefined;
}

function isMilestoneRow(row: SheetRow): boolean {
  return (
    row.status.trim().toLowerCase() === MILESTONE_STATUS.toLowerCase() ||
    (!row.id && /^\s*milestone\s*:/i.test(row.title))
  );
}

/** A task row's fields as far as they can be read; unreadable ones are absent. */
function readTaskRow(
  row: SheetRow,
  team: string,
  where: string,
  warnings: string[],
  vocabulary: StatusVocabulary,
) {
  const fields: Partial<TaskFields> = {
    assignee: row.assignee.trim(),
    notes: row.notes.trim(),
    team,
  };
  const title = row.title.trim();
  if (title) fields.title = title;

  const start = readDate(row.start);
  const end = readDate(row.end);
  if (start === undefined) warnings.push(`${where}: could not read the start date "${row.start}".`);
  if (end === undefined) warnings.push(`${where}: could not read the end date "${row.end}".`);
  if (start !== undefined) fields.start = start;
  if (end !== undefined) fields.end = end;
  // Mirrored as written, not "corrected": the scheduler already ignores a span
  // that ends before it starts, and a sync that refused the dates would
  // rewrite the row on every run. Saying so is enough for someone to fix it.
  if (start && end && start > end) {
    warnings.push(`${where} "${row.title.trim()}" ends before it starts.`);
  }

  const status = readStatus(row.status, vocabulary);
  if (status === undefined) {
    warnings.push(`${where}: "${row.status}" is not a status the website knows.`);
  } else if (row.status.trim().toLowerCase() !== MILESTONE_STATUS.toLowerCase()) {
    fields.status = status;
  }
  return fields;
}

function readMilestoneRow(row: SheetRow, where: string, warnings: string[]) {
  const fields: Partial<MilestoneFields> = {};
  const name = milestoneName(row.title);
  if (name) fields.name = name;
  const end = readDate(row.end);
  const start = readDate(row.start);
  const date = end || start;
  if (date) fields.date = date;
  else if (end === undefined || start === undefined) {
    warnings.push(`${where}: could not read the milestone's date.`);
  }
  return fields;
}

// --- merging -----------------------------------------------------------------

interface Merged<F> {
  result: F;
  changes: Partial<F>;
  base: Partial<F>;
  sheetNeedsWrite: boolean;
  conflicts: (keyof F)[];
}

export function mergeFields<F extends { [K in keyof F]: string }>(
  keys: readonly (keyof F)[],
  sheet: Partial<F>,
  app: F,
  base: Partial<F> | null,
): Merged<F> {
  const result = { ...app };
  const changes: Partial<F> = {};
  const nextBase: Partial<F> = {};
  const conflicts: (keyof F)[] = [];
  let sheetNeedsWrite = false;

  for (const key of keys) {
    const s = sheet[key];
    const a = app[key];
    const b = base?.[key];
    let r: F[keyof F];
    if (s === undefined) r = a; // unreadable cell: keep the website's value and rewrite it
    else if (s === a) r = a;
    else if (b === undefined) r = s !== "" ? s : a; // never agreed: the sheet wins where filled
    else if (s === b) r = a; // changed on the website only
    else if (a === b) r = s; // changed in the sheet only
    else {
      r = a; // changed on both: the website wins
      conflicts.push(key);
    }

    result[key] = r;
    if (r !== a) changes[key] = r;
    if (r !== s) sheetNeedsWrite = true;
    if (r === s) nextBase[key] = r;
    else if (b !== undefined) nextBase[key] = b;
  }
  return { result, changes, base: nextBase, sheetNeedsWrite, conflicts };
}

function taskValues(fields: TaskFields): RowValues {
  return {
    title: fields.title,
    assignee: fields.assignee,
    start: fields.start,
    end: fields.end,
    status: fields.status,
    notes: fields.notes,
  };
}

function milestoneValues(fields: MilestoneFields): RowValues {
  // Assignee and Notes are left alone: the website does not hold them for a
  // milestone, so writing them would only erase what someone typed.
  return {
    title: milestoneTitle(fields.name),
    start: fields.date,
    end: fields.date,
    status: MILESTONE_STATUS,
  };
}

const normalTitle = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();

const conflictNote = (fields: readonly string[]) =>
  `Changed on the website and in this sheet at the same time; the website's ${fields.join(", ")} was kept.`;

/**
 * More than this many rows of a tab disappearing in one sync looks like an
 * accident -- a deleted range, a sort run over a filter -- rather than tidying,
 * so the rows are restored instead of their tasks being deleted.
 */
export function deletionLimit(linkedInTab: number): number {
  return Math.max(3, Math.ceil(linkedInTab * 0.25));
}

// --- planning ----------------------------------------------------------------

export function planSync(input: PlanInput): Plan {
  const plan: Plan = {
    taskUpdates: [],
    taskCreates: [],
    taskDeletes: [],
    milestoneUpdates: [],
    milestoneCreates: [],
    milestoneDeletes: [],
    ops: [],
    conflicts: 0,
    warnings: [],
  };

  const vocabulary = input.vocabulary ?? BASIC_STATUS_WORDS;
  const taskByKey = new Map(input.tasks.map((t) => [t.key, t]));
  const milestoneById = new Map(input.milestones.map((m) => [m.id, m]));
  const claimedTasks = new Set<string>();
  const claimedMilestones = new Set<string>();
  const presentTabs = new Set(input.tabs.map((t) => t.name));

  // The first row carrying an ID owns it. Later copies -- a row duplicated to
  // start a similar task -- are treated as new rows.
  const seenIds = new Set<string>();
  const unlinked: { row: SheetRow; tab: string; team: string }[] = [];

  for (const tab of input.tabs) {
    const team = TAB_TEAM[tab.name];
    if (!team) {
      if (tab.rows.some((r) => r.title.trim())) {
        plan.warnings.push(
          `Tab "${tab.name}" is not linked to a sub-team, so its rows were not synced.`,
        );
      }
      continue;
    }

    for (const row of tab.rows) {
      const where = `${tab.name} row ${row.row}`;
      const id = row.id.trim();
      const firstUse = id !== "" && !seenIds.has(id);
      if (id) seenIds.add(id);

      if (firstUse && id.startsWith(MILESTONE_ID_PREFIX)) {
        const milestone = milestoneById.get(id.slice(MILESTONE_ID_PREFIX.length));
        if (milestone) {
          claimedMilestones.add(milestone.id);
          linkMilestone(plan, milestone, readMilestoneRow(row, where, plan.warnings), tab.name);
          continue;
        }
      } else if (firstUse) {
        const task = taskByKey.get(id);
        if (task) {
          claimedTasks.add(task.id);
          if (isMilestoneRow(row)) {
            plan.warnings.push(
              `${where}: a task's row was marked as a milestone; the website keeps it as a task.`,
            );
          }
          linkTask(plan, task, readTaskRow(row, team, where, plan.warnings, vocabulary));
          continue;
        }
      }

      if (firstUse && input.tombstones.has(id)) {
        // Deleted on the website; the row is what is left of it.
        plan.ops.push({ op: "delete", id });
        continue;
      }

      if (!row.title.trim()) continue; // blank row, or an ID with nothing else
      unlinked.push({ row, tab: tab.name, team });
    }
  }

  // Rows without a usable ID: match them to a website item of the same name
  // before creating anything, so the first sync links the existing plan rather
  // than duplicating it, and a retried sync re-finds what it created last time.
  for (const { row, tab, team } of unlinked) {
    const where = `${tab} row ${row.row}`;
    const at: RowLocation = { tab, row: row.row, title: row.title };

    if (isMilestoneRow(row)) {
      const fields = readMilestoneRow(row, where, plan.warnings);
      const wanted = fields.name ? normalTitle(fields.name) : "";
      const match = input.milestones.find(
        (m) => !claimedMilestones.has(m.id) && normalTitle(m.fields.name) === wanted,
      );
      if (match) {
        claimedMilestones.add(match.id);
        linkMilestone(plan, match, fields, tab, at);
      } else if (fields.name && fields.date) {
        const created = { name: fields.name, date: fields.date };
        plan.milestoneCreates.push({ fields: created, base: { ...created }, at });
      } else {
        plan.warnings.push(`${where}: a milestone needs a name and a date, so it was skipped.`);
      }
      continue;
    }

    const fields = readTaskRow(row, team, where, plan.warnings, vocabulary);
    const wanted = normalTitle(row.title);
    const candidates = input.tasks.filter(
      (t) =>
        !claimedTasks.has(t.id) &&
        t.fields.team === team &&
        normalTitle(t.fields.title) === wanted,
    );
    // Prefer a task never synced: that is the first-sync case. Otherwise one
    // already synced whose row went missing -- its ID did not make it back.
    const match = candidates.find((t) => t.base === null) ?? candidates[0];
    if (match) {
      claimedTasks.add(match.id);
      linkTask(plan, match, fields, at);
      continue;
    }

    const created: TaskFields = {
      title: fields.title ?? row.title.trim(),
      assignee: fields.assignee ?? "",
      start: fields.start ?? "",
      end: fields.end ?? "",
      status: fields.status ?? vocabulary.TODO,
      notes: fields.notes ?? "",
      team,
    };
    // Base only for what the sheet actually says; an unreadable cell is left
    // out so the next sync rewrites it with what the website stored.
    const base: Partial<TaskFields> = {};
    for (const key of TASK_FIELDS) if (fields[key] !== undefined) base[key] = created[key];
    plan.taskCreates.push({ fields: created, base, at });
  }

  // Website items with no row.
  const missingByTab = new Map<string, AppTask[]>();
  const linkedByTab = new Map<string, number>();
  for (const task of input.tasks) {
    const tab = TEAM_TAB[task.fields.team];
    if (!tab) continue;
    if (task.base !== null) linkedByTab.set(tab, (linkedByTab.get(tab) ?? 0) + 1);
    if (claimedTasks.has(task.id)) continue;
    if (!presentTabs.has(tab)) {
      if (task.base !== null) {
        plan.warnings.push(`Tab "${tab}" is missing from the sheet, so ${task.key} was left alone.`);
      }
      continue;
    }
    if (task.base === null) {
      // Never been in the sheet: add it.
      plan.ops.push({ op: "upsert", id: task.key, tab, values: taskValues(task.fields) });
    } else {
      // Was in the sheet, and its row has gone.
      missingByTab.set(tab, [...(missingByTab.get(tab) ?? []), task]);
    }
  }

  for (const [tab, missing] of missingByTab) {
    const limit = deletionLimit(linkedByTab.get(tab) ?? 0);
    if (missing.length > limit) {
      plan.warnings.push(
        `${missing.length} rows disappeared from "${tab}" at once, which looks like an accident, so they were put back. Delete tasks on the website, or a few rows at a time, if it was intended.`,
      );
      for (const task of missing) {
        plan.ops.push({
          op: "upsert",
          id: task.key,
          tab,
          values: taskValues(task.fields),
          note: "Restored: this row disappeared along with many others in one go.",
        });
      }
    } else {
      for (const task of missing) plan.taskDeletes.push({ id: task.id, key: task.key });
    }
  }

  const milestoneTabPresent = presentTabs.has(MILESTONE_TAB);
  const missingMilestones = input.milestones.filter(
    (m) => !claimedMilestones.has(m.id) && m.base !== null,
  );
  for (const milestone of input.milestones) {
    if (claimedMilestones.has(milestone.id) || milestone.base !== null) continue;
    if (milestoneTabPresent) {
      plan.ops.push({
        op: "upsert",
        id: MILESTONE_ID_PREFIX + milestone.id,
        tab: MILESTONE_TAB,
        values: milestoneValues(milestone.fields),
      });
    }
  }
  if (milestoneTabPresent && missingMilestones.length > 0) {
    const linked = input.milestones.filter((m) => m.base !== null).length;
    if (missingMilestones.length > deletionLimit(linked)) {
      plan.warnings.push(
        `${missingMilestones.length} milestone rows disappeared at once, so they were put back.`,
      );
      for (const milestone of missingMilestones) {
        plan.ops.push({
          op: "upsert",
          id: MILESTONE_ID_PREFIX + milestone.id,
          tab: MILESTONE_TAB,
          values: milestoneValues(milestone.fields),
          note: "Restored: this row disappeared along with many others in one go.",
        });
      }
    } else {
      for (const milestone of missingMilestones) plan.milestoneDeletes.push({ id: milestone.id });
    }
  }

  return plan;
}

function linkTask(plan: Plan, task: AppTask, sheet: Partial<TaskFields>, at?: RowLocation) {
  const merged = mergeFields<TaskFields>(TASK_FIELDS, sheet, task.fields, task.base);
  const { result } = merged;

  plan.taskUpdates.push({ id: task.id, changes: merged.changes, base: merged.base });
  if (merged.conflicts.length > 0) plan.conflicts += 1;

  if (merged.sheetNeedsWrite || at) {
    const tab = TEAM_TAB[result.team];
    plan.ops.push({
      op: "upsert",
      id: task.key,
      tab,
      values: taskValues(result),
      ...(at ? { at: { row: at.row, title: at.title } } : {}),
      ...(merged.conflicts.length > 0 ? { note: conflictNote(merged.conflicts.map(String)) } : {}),
    });
  }
}

function linkMilestone(
  plan: Plan,
  milestone: AppMilestone,
  sheet: Partial<MilestoneFields>,
  tab: string,
  at?: RowLocation,
) {
  const merged = mergeFields<MilestoneFields>(
    MILESTONE_FIELDS,
    sheet,
    milestone.fields,
    milestone.base,
  );
  plan.milestoneUpdates.push({ id: milestone.id, changes: merged.changes, base: merged.base });
  if (merged.conflicts.length > 0) plan.conflicts += 1;
  if (merged.sheetNeedsWrite || at) {
    plan.ops.push({
      op: "upsert",
      id: MILESTONE_ID_PREFIX + milestone.id,
      tab,
      values: milestoneValues(merged.result),
      ...(at ? { at: { row: at.row, title: at.title } } : {}),
      ...(merged.conflicts.length > 0 ? { note: conflictNote(merged.conflicts.map(String)) } : {}),
    });
  }
}

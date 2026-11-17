/**
 * The task panel's copy of a task, kept in step with the board.
 *
 * The panel holds two kinds of change. Field edits (title, dates, people...)
 * wait for Save. Checklist ticks, links and dependencies are saved the moment
 * they are made. Fresh data from the server can arrive at any time -- after
 * any change, from anyone -- and must overwrite neither: typing in the
 * description and then ticking a checklist item used to wipe the typing, and
 * a tick could vanish when the board reloaded before the tick had been saved.
 */
import type { TaskView } from "@/lib/project";

/** Changes sent to the server and not yet confirmed. */
export interface PendingChanges {
  /** Checklist items being ticked or unticked, by id. */
  done: Record<string, boolean>;
  /** Checklist items, links and dependencies being removed, by id. */
  removed: string[];
}

export const NO_PENDING: PendingChanges = { done: {}, removed: [] };

const day = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Fields edited in the panel and saved with Save, and how to compare them. */
const FIELDS: { [K in keyof TaskView]?: (a: TaskView[K], b: TaskView[K]) => boolean } = {
  title: (a, b) => a === b,
  description: (a, b) => a === b,
  status: (a, b) => a === b,
  priority: (a, b) => a === b,
  assigneeIds: sameSet,
  milestoneId: (a, b) => a === b,
  workstreamId: (a, b) => a === b,
  ownerLabel: (a, b) => a === b,
  notes: (a, b) => a === b,
  plannedStart: (a, b) => day(a) === day(b),
  plannedEnd: (a, b) => day(a) === day(b),
};

/**
 * The panel's copy after the board sent `after` in place of `before`: the
 * server's task, with the person's unsaved field edits and pending changes
 * laid back over it.
 */
export function rebaseDraft(draft: TaskView, before: TaskView, after: TaskView, pending: PendingChanges): TaskView {
  const next: TaskView = { ...after };
  for (const [field, same] of Object.entries(FIELDS) as [keyof TaskView, (a: unknown, b: unknown) => boolean][]) {
    if (!same(draft[field], before[field])) (next as unknown as Record<string, unknown>)[field] = draft[field];
  }
  const gone = (id: string) => pending.removed.includes(id);
  next.subtasks = after.subtasks
    .filter((item) => !gone(item.id))
    .map((item) => (item.id in pending.done ? { ...item, done: pending.done[item.id] } : item));
  next.links = after.links.filter((link) => !gone(link.id));
  next.blockedBy = after.blockedBy.filter((dep) => !gone(dep.depId));
  next.blocks = after.blocks.filter((dep) => !gone(dep.depId));
  return next;
}

/** What to tell someone whose change the server refused. */
export async function refusal(response: Response | null, what: string): Promise<string> {
  if (!response) return `Couldn't save ${what}: check your connection and try again.`;
  const body = await response.json().catch(() => null);
  if (response.status === 401) {
    return body?.error && body.error !== "Sign in first."
      ? `Couldn't save ${what}. ${body.error}`
      : `Couldn't save ${what}: your sign-in has expired. Sign in again to carry on.`;
  }
  if (response.status === 403 && body?.error) return `Couldn't save ${what}. ${body.error}`;
  if (response.status === 404) return `Couldn't save ${what}: it was removed, perhaps by someone else. Close and reopen the task.`;
  return `Couldn't save ${what}. Try again in a moment.`;
}

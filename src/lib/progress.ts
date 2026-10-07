import type { TaskStatus } from "./domain";

/**
 * A task's progress, from the only inputs that set it now.
 *
 * Progress used to be a free slider, which nobody kept up to date and which
 * meant nothing in particular when it was. It now has one meaning: the share
 * of the checklist that is ticked. The forecast still reads it -- remaining
 * work is duration x (1 - progress) -- so this function is the single place
 * that decides it, called wherever status or the checklist changes.
 *
 * - Done is 100, whatever the checklist says: the card was moved to Done.
 * - With a checklist, it is the ticked share. All ticked is 100 but the task
 *   does not move itself to Done: finished work may still be waiting in
 *   review, and moving a card is a decision someone should make.
 * - Without a checklist there is no input, so the stored value is kept. The
 *   one exception is a leftover 100 from a trip through Done: reopening a
 *   task must not leave it claiming no work remains, or the forecast treats
 *   it as finished.
 */
export function deriveProgress(
  status: TaskStatus,
  checklist: readonly { done: boolean }[],
  current: number,
): number {
  if (status === "DONE") return 100;
  if (checklist.length > 0) {
    const done = checklist.filter((item) => item.done).length;
    return Math.round((done / checklist.length) * 100);
  }
  return current >= 100 ? 0 : Math.max(0, current);
}

/**
 * The progress to *show* for a task, or null when there is nothing to show.
 *
 * Only a checklist produces a number worth drawing; a bar on every card that
 * nobody updates is noise. Computed from the items rather than read from the
 * stored value so a tick shows instantly, before the server has answered.
 */
export function checklistProgress(task: {
  status: TaskStatus;
  subtasks: readonly { done: boolean }[];
}): { percent: number; done: number; total: number } | null {
  const total = task.subtasks.length;
  if (total === 0) return null;
  const done = task.subtasks.filter((item) => item.done).length;
  return {
    percent: task.status === "DONE" ? 100 : Math.round((done / total) * 100),
    done,
    total,
  };
}

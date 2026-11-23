/**
 * Blocking a task, and unblocking it again.
 *
 * Moving a task to Blocked means saying why and what it is waiting on. The
 * task is flagged with the reason, and each thing it waits on -- a task made
 * there and then, or one that already exists -- is linked to it as a
 * blocker: a TaskDependency with `blocking` set. A blocker's priority says
 * how urgent clearing it is, and the leads of its sub-team are told about it
 * (src/lib/alerts.ts).
 *
 * When every blocker is Done or In review, the task is unblocked: back to In
 * progress, its flag down, and the people on it told. The links stay as
 * ordinary dependencies. Moving a task out of Blocked by hand, or deleting
 * the last of its blockers, unblocks it the same way.
 */
import type { Prisma } from "@/generated/prisma";
import { STATUS_LABEL, type TaskStatus } from "./domain";
import { deriveProgress } from "./progress";

type Tx = Prisma.TransactionClient;

/** A blocker counts as dealt with once it is finished or waiting on review. */
export const CLEARS_BLOCK: ReadonlySet<TaskStatus> = new Set<TaskStatus>(["DONE", "IN_REVIEW"]);

/** Ids of Blocked tasks waiting on any of these, as blockers. */
export async function blockedBehind(tx: Tx, blockerIds: string[]): Promise<string[]> {
  if (blockerIds.length === 0) return [];
  const edges = await tx.taskDependency.findMany({
    where: { predecessorId: { in: blockerIds }, blocking: true },
    select: { successorId: true },
  });
  return [...new Set(edges.map((e) => e.successorId))];
}

/** Why a task stopped being blocked, for the people told about it. */
export type Unblocked =
  | { kind: "cleared" }
  | { kind: "removed" }
  | { kind: "moved"; to: TaskStatus; byName: string | null };

const ref = (t: { key: string; title: string }) => `${t.key} "${t.title}"`;

/**
 * Unblock any of these tasks that is Blocked and has nothing left blocking
 * it: every blocker Done or In review, or deleted. Returns those unblocked.
 * Call it with the tasks waiting on something that just moved or went (see
 * blockedBehind), inside the same transaction.
 */
export async function releaseBlocked(tx: Tx, taskIds: string[], actorId?: string | null): Promise<string[]> {
  const released: string[] = [];
  for (const id of new Set(taskIds)) {
    const task = await tx.task.findUnique({
      where: { id },
      select: {
        status: true,
        blockedBy: {
          where: { blocking: true },
          select: { predecessor: { select: { key: true, title: true, status: true } } },
        },
      },
    });
    if (!task || task.status !== "BLOCKED") continue;
    const blockers = task.blockedBy.map((e) => e.predecessor);
    if (blockers.some((b) => !CLEARS_BLOCK.has(b.status as TaskStatus))) continue;
    await unblock(tx, id, blockers.length === 0 ? { kind: "removed" } : { kind: "cleared" }, actorId);
    released.push(id);
  }
  return released;
}

/**
 * Take a task out of Blocked: its flag down, its blockers back to ordinary
 * dependencies, and everyone on it told. `to` is where it goes: In progress
 * when unblocked for them, or wherever someone moved it by hand (the caller
 * has already set that status).
 */
export async function unblock(tx: Tx, taskId: string, why: Unblocked, actorId?: string | null): Promise<void> {
  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: {
      key: true,
      title: true,
      teamId: true,
      status: true,
      progress: true,
      actualStart: true,
      blockedByMemberId: true,
      assignees: { select: { id: true } },
      subtasks: { select: { done: true } },
      blockedBy: {
        where: { blocking: true },
        select: { predecessor: { select: { key: true, title: true, status: true } } },
      },
    },
  });
  if (!task) return;
  const blockers = task.blockedBy.map((e) => e.predecessor);

  const status: TaskStatus = why.kind === "moved" ? why.to : "IN_PROGRESS";
  await tx.task.update({
    where: { id: taskId },
    data: {
      flagged: false,
      flagReason: null,
      blockedByMemberId: null,
      ...(why.kind === "moved"
        ? {}
        : {
            status,
            progress: deriveProgress(status, task.subtasks, task.progress),
            actualStart: task.actualStart ?? new Date(),
            actualEnd: null,
          }),
    },
  });
  await tx.taskDependency.updateMany({
    where: { successorId: taskId, blocking: true },
    data: { blocking: false },
  });

  const because =
    why.kind === "moved"
      ? `${why.byName ?? "Someone"} moved it to ${STATUS_LABEL[why.to]}.`
      : why.kind === "removed"
        ? "what it was waiting on was removed. It's back in progress."
        : blockers.length === 1
          ? `${ref(blockers[0])} is ${STATUS_LABEL[blockers[0].status as TaskStatus].toLowerCase()}. It's back in progress.`
          : `everything it was waiting on is done or in review. It's back in progress.`;
  const message = `${ref(task)} is no longer blocked: ${because}`;

  // The people on it, and whoever blocked it; failing those, its team's leads.
  let recipients = new Set([...task.assignees.map((a) => a.id), ...(task.blockedByMemberId ? [task.blockedByMemberId] : [])]);
  if (recipients.size === 0) {
    const leads = await tx.member.findMany({ where: { teamId: task.teamId, role: "TEAM_LEAD" }, select: { id: true } });
    recipients = new Set(leads.map((l) => l.id));
  }
  if (actorId) recipients.delete(actorId);
  if (recipients.size > 0) {
    await tx.notification.createMany({
      data: [...recipients].map((memberId) => ({ memberId, taskId, message })),
    });
  }
}

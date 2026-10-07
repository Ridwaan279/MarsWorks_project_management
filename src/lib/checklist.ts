import type { Prisma } from "@/generated/prisma";
import { deriveProgress } from "./progress";

/**
 * Recompute a task's progress after its checklist changed. Runs inside the
 * caller's transaction so the item and the progress it implies are written
 * together; a reader can never see one without the other.
 */
export async function refreshProgress(
  tx: Prisma.TransactionClient,
  taskId: string,
): Promise<void> {
  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: { status: true, progress: true, subtasks: { select: { done: true } } },
  });
  if (!task) return;
  const progress = deriveProgress(task.status, task.subtasks, task.progress);
  if (progress !== task.progress) {
    await tx.task.update({ where: { id: taskId }, data: { progress } });
  }
}

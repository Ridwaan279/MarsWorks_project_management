import type { Prisma } from "@/generated/prisma";

/**
 * Would making `predecessor` come before `successor` close a loop?
 *
 * True when the predecessor is already downstream of the successor, so the
 * new edge would point back into its own past. The schedule engine survives a
 * cycle -- it drops the offending edges and solves the rest -- but the dates
 * it then reports are quietly wrong, so this is worth refusing up front and
 * saying why.
 */
export async function wouldCycle(
  db: Pick<Prisma.TransactionClient, "taskDependency">,
  predecessorId: string,
  successorId: string,
): Promise<boolean> {
  if (predecessorId === successorId) return true;
  const edges = await db.taskDependency.findMany({
    select: { predecessorId: true, successorId: true },
  });
  const downstream = new Map<string, string[]>();
  for (const edge of edges) {
    const list = downstream.get(edge.predecessorId) ?? [];
    list.push(edge.successorId);
    downstream.set(edge.predecessorId, list);
  }
  // Walk forward from the successor; reaching the predecessor closes a loop.
  const queue = [successorId];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === predecessorId) return true;
    for (const next of downstream.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

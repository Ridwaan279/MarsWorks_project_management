import type { Prisma } from "@/generated/prisma";

/**
 * Hands out task keys (SW-1, SW-2, ...) for one sub-team.
 *
 * Numbers continue past every key the team has ever used, including deleted
 * ones. Reissuing a deleted task's key would make an old row in the Google
 * Sheet, still carrying that key, indistinguishable from the new task.
 *
 * Call inside the transaction that creates the tasks, so two people adding a
 * card at once cannot be given the same number.
 */
export async function keyAllocator(tx: Prisma.TransactionClient, teamKey: string) {
  const prefix = `${teamKey}-`;
  const [tasks, tombstones] = await Promise.all([
    tx.task.findMany({ where: { key: { startsWith: prefix } }, select: { key: true } }),
    tx.syncTombstone.findMany({ where: { ref: { startsWith: prefix } }, select: { ref: true } }),
  ]);
  let highest = 0;
  for (const key of [...tasks.map((t) => t.key), ...tombstones.map((t) => t.ref)]) {
    const n = Number.parseInt(key.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > highest) highest = n;
  }
  return () => `${prefix}${++highest}`;
}

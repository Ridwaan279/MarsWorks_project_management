import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { currentViewer } from "@/lib/auth/session";
import { pokeSheet } from "@/lib/sheets/poke";
import { keyAllocator } from "@/lib/task-keys";
import { wouldCycle } from "@/lib/dependencies";
import { CLEARS_BLOCK } from "@/lib/blocking";
import { TASK_PRIORITIES, type TaskStatus } from "@/lib/domain";

/**
 * Move a task to Blocked: say why, and what it is waiting on. See
 * src/lib/blocking.ts. Everything happens together or not at all, so a task
 * is never left Blocked without its reason and blockers.
 */
const blockTask = z.object({
  reason: z.string().trim().min(1, "Say why it is blocked.").max(500),
  blockers: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("new"),
          title: z.string().trim().min(1, "Give the blocking task a title.").max(200),
          teamId: z.string().min(1),
          priority: z.enum(TASK_PRIORITIES),
          assigneeIds: z.array(z.string().min(1)).max(40).default([]),
        }),
        z.object({ kind: z.literal("existing"), taskId: z.string().min(1) }),
      ]),
    )
    .min(1, "Add at least one task it is waiting on.")
    .max(10),
});

class Refused extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireWriteAccess();
  if (denied) return denied;
  const { id } = await context.params;
  const parsed = blockTask.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: first, details: parsed.error.flatten() }, { status: 400 });
  }
  const { reason, blockers } = parsed.data;
  const viewer = await currentViewer();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id },
        select: { id: true, status: true, blockedByMemberId: true },
      });
      if (!task) throw new Refused("That task no longer exists.", 404);

      const blockerIds: string[] = [];
      const created: { id: string; key: string }[] = [];
      const allocators = new Map<string, () => string>();

      for (const blocker of blockers) {
        if (blocker.kind === "existing") {
          const existing = await tx.task.findUnique({
            where: { id: blocker.taskId },
            select: { id: true, key: true, status: true },
          });
          if (!existing) throw new Refused("One of the tasks it waits on no longer exists.", 404);
          if (existing.id === id) throw new Refused("A task cannot block itself.");
          if (CLEARS_BLOCK.has(existing.status as TaskStatus)) {
            throw new Refused(`${existing.key} is already done or in review, so it cannot block anything.`);
          }
          if (await wouldCycle(tx, existing.id, id)) {
            throw new Refused(`${existing.key} is already waiting on this task, so it cannot block it as well.`, 409);
          }
          blockerIds.push(existing.id);
          continue;
        }

        const team = await tx.team.findUnique({ where: { id: blocker.teamId }, select: { key: true } });
        if (!team) throw new Refused("Choose a sub-team for the blocking task.");
        let next = allocators.get(team.key);
        if (!next) {
          next = await keyAllocator(tx, team.key);
          allocators.set(team.key, next);
        }
        // New cards land at the top of To do, as on the board.
        const first = await tx.task.findFirst({
          where: { status: "TODO" },
          orderBy: { boardOrder: "asc" },
          select: { boardOrder: true },
        });
        const made = await tx.task.create({
          data: {
            key: next(),
            title: blocker.title,
            teamId: blocker.teamId,
            status: "TODO",
            priority: blocker.priority,
            assignees: blocker.assigneeIds.length
              ? { connect: blocker.assigneeIds.map((assignee) => ({ id: assignee })) }
              : undefined,
            boardOrder: (first?.boardOrder ?? 1000) - 1000,
          },
          select: { id: true, key: true },
        });
        created.push(made);
        blockerIds.push(made.id);
      }

      for (const blockerId of new Set(blockerIds)) {
        await tx.taskDependency.upsert({
          where: { predecessorId_successorId: { predecessorId: blockerId, successorId: id } },
          create: { predecessorId: blockerId, successorId: id, blocking: true },
          update: { blocking: true },
        });
      }

      return tx.task.update({
        where: { id },
        data: {
          status: "BLOCKED",
          flagged: true,
          flagReason: reason,
          // Adding to what an already Blocked task waits on keeps who blocked it.
          blockedByMemberId:
            task.status === "BLOCKED" && task.blockedByMemberId ? task.blockedByMemberId : (viewer.member?.id ?? null),
        },
        select: { id: true, key: true, status: true },
      }).then((blocked) => ({ blocked, created }));
    });
    pokeSheet("website");
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Refused) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Failed to block task", error);
    return NextResponse.json({ error: "Could not block that task. Try again in a moment." }, { status: 500 });
  }
}

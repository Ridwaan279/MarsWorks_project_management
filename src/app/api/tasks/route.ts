import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/domain";

const createTask = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).optional(),
  teamId: z.string().min(1),
  status: z.enum(TASK_STATUSES).default("BACKLOG"),
  priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
  assigneeId: z.string().nullable().optional(),
  milestoneId: z.string().nullable().optional(),
  estimateDays: z.number().int().min(0).max(365).default(1),
});

/**
 * Task keys are per-team sequential (CHS-1, CHS-2). Generated inside the same
 * transaction as the insert so two people adding a card at once cannot collide.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createTask.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid task", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  try {
    const task = await prisma.$transaction(async (tx) => {
      const team = await tx.team.findUnique({ where: { id: data.teamId } });
      if (!team) throw new Error("UNKNOWN_TEAM");

      const existing = await tx.task.findMany({
        where: { teamId: team.id },
        select: { key: true },
      });
      const highest = existing.reduce((max, t) => {
        const n = Number.parseInt(t.key.split("-")[1] ?? "0", 10);
        return Number.isFinite(n) && n > max ? n : max;
      }, 0);

      // New cards land at the top of their column.
      const first = await tx.task.findFirst({
        where: { status: data.status },
        orderBy: { boardOrder: "asc" },
        select: { boardOrder: true },
      });

      return tx.task.create({
        data: {
          key: `${team.key}-${highest + 1}`,
          title: data.title,
          description: data.description,
          teamId: team.id,
          status: data.status,
          priority: data.priority,
          assigneeId: data.assigneeId ?? null,
          milestoneId: data.milestoneId ?? null,
          estimateDays: data.estimateDays,
          boardOrder: (first?.boardOrder ?? 1000) - 1000,
        },
      });
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNKNOWN_TEAM") {
      return NextResponse.json({ error: "Unknown team" }, { status: 400 });
    }
    console.error("Failed to create task", error);
    return NextResponse.json({ error: "Could not create task" }, { status: 500 });
  }
}

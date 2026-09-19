import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/domain";

const updateTask = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(10_000).nullable(),
    status: z.enum(TASK_STATUSES),
    priority: z.enum(TASK_PRIORITIES),
    assigneeId: z.string().nullable(),
    milestoneId: z.string().nullable(),
    estimateDays: z.number().int().min(0).max(365),
    progress: z.number().int().min(0).max(100),
    boardOrder: z.number().int(),
    earliestStart: z.string().datetime().nullable(),
  })
  .partial();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateTask.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid update", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { earliestStart, ...rest } = parsed.data;
  const data = {
    ...rest,
    ...(earliestStart !== undefined
      ? { earliestStart: earliestStart ? new Date(earliestStart) : null }
      : {}),
    // Moving a card to Done implies the work is finished; keeping progress in
    // step stops the forecast disagreeing with the board.
    ...(rest.status === "DONE" ? { progress: 100 } : {}),
  };

  try {
    const task = await prisma.task.update({ where: { id }, data });
    return NextResponse.json(task);
  } catch (error) {
    console.error("Failed to update task", error);
    return NextResponse.json({ error: "Could not update task" }, { status: 404 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    await prisma.task.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Could not delete task" }, { status: 404 });
  }
}

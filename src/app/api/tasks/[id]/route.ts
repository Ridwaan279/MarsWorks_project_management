import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PROJECT_STAGES, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/domain";

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
    stage: z.enum(PROJECT_STAGES).nullable(),
    workstreamId: z.string().nullable(),
    ownerLabel: z.string().max(200).nullable(),
    notes: z.string().max(10_000).nullable(),
    // Dates arrive as plain YYYY-MM-DD from the date inputs.
    plannedStart: z.string().date().nullable(),
    plannedEnd: z.string().date().nullable(),
  })
  .partial()
  .refine(
    (v) =>
      !v.plannedStart ||
      !v.plannedEnd ||
      new Date(v.plannedStart) <= new Date(v.plannedEnd),
    { message: "Start date must not be after the end date", path: ["plannedEnd"] },
  );

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

  const { earliestStart, plannedStart, plannedEnd, ...rest } = parsed.data;
  const data = {
    ...rest,
    ...(earliestStart !== undefined
      ? { earliestStart: earliestStart ? new Date(earliestStart) : null }
      : {}),
    ...(plannedStart !== undefined
      ? { plannedStart: plannedStart ? new Date(plannedStart) : null }
      : {}),
    ...(plannedEnd !== undefined
      ? { plannedEnd: plannedEnd ? new Date(plannedEnd) : null }
      : {}),
    // Status and progress are two views of the same fact, so keep them in step
    // in both directions: moving a card to Done finishes it, and finishing it
    // moves the card. Otherwise the board and the forecast disagree.
    ...(rest.status === "DONE" ? { progress: 100 } : {}),
    ...(rest.progress === 100 && rest.status === undefined ? { status: "DONE" as const } : {}),
  };

  try {
    const task = await prisma.$transaction(async (tx) => {
      const existing = await tx.task.findUnique({
        where: { id },
        select: { actualStart: true },
      });
      if (!existing) throw new Error("NOT_FOUND");

      // Record when work really started and finished, so completed tasks can
      // be drawn where they happened rather than at today's date. actualStart
      // is only ever set once: a card bouncing back into progress must not
      // overwrite the day the work actually began.
      const becomesDone = data.status === "DONE";
      const timestamps: { actualStart?: Date; actualEnd?: Date | null } = {};
      if (
        (data.status === "IN_PROGRESS" || becomesDone) &&
        !existing.actualStart
      ) {
        timestamps.actualStart = new Date();
      }
      if (becomesDone) timestamps.actualEnd = new Date();
      else if (data.status !== undefined) timestamps.actualEnd = null;

      return tx.task.update({ where: { id }, data: { ...data, ...timestamps } });
    });
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

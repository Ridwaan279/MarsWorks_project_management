import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { refreshProgress } from "@/lib/checklist";

const updateSubtask = z
  .object({
    title: z.string().trim().min(1).max(200),
    done: z.boolean(),
  })
  .partial();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const parsed = updateSubtask.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid checklist item", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const subtask = await prisma.$transaction(async (tx) => {
      const updated = await tx.subtask.update({ where: { id }, data: parsed.data });
      await refreshProgress(tx, updated.taskId);
      return updated;
    });
    return NextResponse.json(subtask);
  } catch {
    return NextResponse.json({ error: "Unknown checklist item" }, { status: 404 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    await prisma.$transaction(async (tx) => {
      const removed = await tx.subtask.delete({ where: { id } });
      await refreshProgress(tx, removed.taskId);
    });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Unknown checklist item" }, { status: 404 });
  }
}

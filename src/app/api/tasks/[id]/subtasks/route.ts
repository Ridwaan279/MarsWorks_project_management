import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { refreshProgress } from "@/lib/checklist";

const createSubtask = z.object({
  title: z.string().trim().min(1).max(200),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const parsed = createSubtask.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid checklist item", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    // Append rather than insert: position orders the checklist, and a new
    // item belongs at the bottom of the list the author is looking at.
    const subtask = await prisma.$transaction(async (tx) => {
      const last = await tx.subtask.findFirst({
        where: { taskId: id },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const created = await tx.subtask.create({
        data: {
          taskId: id,
          title: parsed.data.title,
          position: (last?.position ?? -1) + 1,
        },
      });
      await refreshProgress(tx, id);
      return created;
    });
    return NextResponse.json(subtask, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unknown task" }, { status: 404 });
  }
}

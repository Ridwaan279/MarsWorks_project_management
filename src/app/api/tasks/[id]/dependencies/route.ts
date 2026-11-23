import { NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { wouldCycle } from "@/lib/dependencies";

const createDependency = z.object({
  /** The task that must finish first. */
  predecessorId: z.string().min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireWriteAccess();
  if (denied) return denied;
  const { id } = await context.params;
  const parsed = createDependency.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid dependency", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { predecessorId } = parsed.data;

  if (predecessorId === id) {
    return NextResponse.json(
      { error: "A task cannot wait on itself." },
      { status: 400 },
    );
  }

  const both = await prisma.task.findMany({
    where: { id: { in: [id, predecessorId] } },
    select: { id: true },
  });
  if (both.length !== 2) {
    return NextResponse.json({ error: "Unknown task" }, { status: 404 });
  }

  if (await wouldCycle(prisma, predecessorId, id)) {
    return NextResponse.json(
      {
        error:
          "That would make the two tasks wait on each other. Remove the existing link first.",
      },
      { status: 409 },
    );
  }

  const existing = await prisma.taskDependency.findFirst({
    where: { predecessorId, successorId: id },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Already linked." }, { status: 409 });
  }

  const dependency = await prisma.taskDependency.create({
    data: { predecessorId, successorId: id },
  });
  return NextResponse.json(dependency, { status: 201 });
}

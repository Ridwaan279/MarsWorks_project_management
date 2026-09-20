import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const createDependency = z.object({
  /** The task that must finish first. */
  predecessorId: z.string().min(1),
});

/**
 * Would making `predecessor` come before `successor` close a loop?
 *
 * True when the predecessor is already downstream of the successor, so the
 * new edge would point back into its own past. The schedule engine survives a
 * cycle -- it drops the offending edges and solves the rest -- but the dates
 * it then reports are quietly wrong, so this is worth refusing up front and
 * saying why.
 */
async function wouldCycle(predecessorId: string, successorId: string) {
  if (predecessorId === successorId) return true;
  const edges = await prisma.taskDependency.findMany({
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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  if (await wouldCycle(predecessorId, id)) {
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

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PROJECT_STAGES, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/domain";

const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), {
    message: "Link must start with http:// or https://",
  });

const createTask = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(10_000).optional(),
    teamId: z.string().min(1),
    status: z.enum(TASK_STATUSES).default("BACKLOG"),
    priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
    assigneeId: z.string().nullable().optional(),
    milestoneId: z.string().nullable().optional(),
    workstreamId: z.string().nullable().optional(),
    stage: z.enum(PROJECT_STAGES).nullable().optional(),
    ownerLabel: z.string().max(200).nullable().optional(),
    notes: z.string().max(10_000).nullable().optional(),
    estimateDays: z.number().int().min(0).max(365).default(1),
    progress: z.number().int().min(0).max(100).default(0),
    // Plain YYYY-MM-DD, as the date inputs produce.
    plannedStart: z.string().date().nullable().optional(),
    plannedEnd: z.string().date().nullable().optional(),
    links: z.array(z.object({ label: z.string().trim().max(120), url: httpUrl })).max(20).optional(),
  })
  .refine(
    (v) =>
      !v.plannedStart ||
      !v.plannedEnd ||
      new Date(v.plannedStart) <= new Date(v.plannedEnd),
    { message: "Start date must not be after the end date", path: ["plannedEnd"] },
  );

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

      // Keep status and progress in step from the outset, the same way an
      // update does, rather than letting a task be created at 100% and To do.
      const done = data.status === "DONE" || data.progress === 100;

      return tx.task.create({
        data: {
          key: `${team.key}-${highest + 1}`,
          title: data.title,
          description: data.description || null,
          notes: data.notes || null,
          ownerLabel: data.ownerLabel || null,
          teamId: team.id,
          status: done ? "DONE" : data.status,
          priority: data.priority,
          stage: data.stage ?? null,
          assigneeId: data.assigneeId || null,
          milestoneId: data.milestoneId || null,
          workstreamId: data.workstreamId || null,
          estimateDays: data.estimateDays,
          progress: done ? 100 : data.progress,
          plannedStart: data.plannedStart ? new Date(data.plannedStart) : null,
          plannedEnd: data.plannedEnd ? new Date(data.plannedEnd) : null,
          actualEnd: done ? new Date() : null,
          boardOrder: (first?.boardOrder ?? 1000) - 1000,
          links: data.links?.length
            ? {
                create: data.links.map((link) => ({
                  // A URL with no label is far more common than the reverse,
                  // so fall back to the hostname rather than rejecting it.
                  label: link.label || hostnameOf(link.url),
                  url: link.url,
                })),
              }
            : undefined,
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

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

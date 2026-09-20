import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const createWorkstream = z.object({
  teamId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  /** Work-breakdown code as the team writes it, e.g. "3.0". Optional. */
  code: z.string().trim().max(20).nullable().optional(),
});

/**
 * Workstreams are created from the new-task dialog, because that is when
 * someone discovers theirs does not exist yet. Sending them elsewhere to make
 * one first is how tasks end up ungrouped.
 */
export async function POST(request: Request) {
  const parsed = createWorkstream.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid workstream", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { teamId, name, code } = parsed.data;

  try {
    const workstream = await prisma.$transaction(async (tx) => {
      const team = await tx.team.findUnique({ where: { id: teamId } });
      if (!team) throw new Error("UNKNOWN_TEAM");

      // Names are unique per team. Re-use rather than reject, so two people
      // adding the same workstream at once both end up pointing at one.
      const existing = await tx.workstream.findFirst({ where: { teamId, name } });
      if (existing) return existing;

      const last = await tx.workstream.findFirst({
        where: { teamId },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      return tx.workstream.create({
        data: {
          teamId,
          name,
          code: code || null,
          position: (last?.position ?? -1) + 1,
        },
      });
    });

    return NextResponse.json(workstream, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNKNOWN_TEAM") {
      return NextResponse.json({ error: "Unknown sub-team" }, { status: 400 });
    }
    console.error("Failed to create workstream", error);
    return NextResponse.json({ error: "Could not create workstream" }, { status: 500 });
  }
}

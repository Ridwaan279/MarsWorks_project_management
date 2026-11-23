import { NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { currentViewer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { releaseBlocked } from "@/lib/blocking";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireWriteAccess();
  if (denied) return denied;
  const { id } = await context.params;
  const actor = (await currentViewer()).member;
  try {
    await prisma.$transaction(async (tx) => {
      const removed = await tx.taskDependency.delete({ where: { id } });
      // Taking away what a Blocked task waits on may leave it free to go.
      if (removed.blocking) await releaseBlocked(tx, [removed.successorId], actor?.id);
    });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Unknown dependency" }, { status: 404 });
  }
}

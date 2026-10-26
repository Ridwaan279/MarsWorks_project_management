import { NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { prisma } from "@/lib/db";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireWriteAccess();
  if (denied) return denied;
  const { id } = await context.params;
  try {
    await prisma.taskDependency.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Unknown dependency" }, { status: 404 });
  }
}

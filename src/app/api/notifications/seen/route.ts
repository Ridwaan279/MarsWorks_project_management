import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { currentViewer } from "@/lib/auth/session";

/** Dismiss notices: they stop showing when the site is opened. */
const seen = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) });

export async function POST(request: Request) {
  const viewer = await currentViewer();
  if (!viewer.member) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = seen.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  // Only ever their own.
  const { count } = await prisma.notification.updateMany({
    where: { id: { in: parsed.data.ids }, memberId: viewer.member.id, seenAt: null },
    data: { seenAt: new Date() },
  });
  return NextResponse.json({ seen: count });
}

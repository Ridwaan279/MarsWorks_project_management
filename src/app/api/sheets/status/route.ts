import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncConfigured } from "@/lib/sheets/auth";

export const dynamic = "force-dynamic";

/** When the sheet last synced, for the status line on the overview. */
export async function GET() {
  if (!syncConfigured()) return NextResponse.json({ configured: false });
  const last = await prisma.sheetSyncRun.findFirst({
    where: { finishedAt: { not: null } },
    orderBy: { startedAt: "desc" },
  });
  const lastOk = await prisma.sheetSyncRun.findFirst({
    where: { ok: true },
    orderBy: { startedAt: "desc" },
    select: { finishedAt: true },
  });
  return NextResponse.json({
    configured: true,
    last: last && { at: last.finishedAt, ok: last.ok, reason: last.reason, summary: last.summary },
    lastOkAt: lastOk?.finishedAt ?? null,
  });
}

import { formatDistanceStrict } from "date-fns";
import { prisma } from "@/lib/db";
import { syncConfigured } from "@/lib/sheets/auth";

/**
 * One line saying whether the Google Sheet is keeping up.
 *
 * The sheet syncs every five minutes at the latest, so anything much older
 * means the triggers have stopped -- typically because whoever installed them
 * lost access to the sheet -- and the two copies are drifting apart unseen.
 * That is the case worth shouting about; a healthy sync stays quiet.
 */
export async function SheetSyncStatus() {
  if (!syncConfigured()) return null;

  const [last, lastOk] = await Promise.all([
    prisma.sheetSyncRun.findFirst({
      where: { finishedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { ok: true, finishedAt: true },
    }),
    prisma.sheetSyncRun.findFirst({
      where: { ok: true },
      orderBy: { startedAt: "desc" },
      select: { finishedAt: true },
    }),
  ]);

  const now = new Date();
  if (!lastOk?.finishedAt) {
    return (
      <p className="text-xs text-warning">
        Google Sheets sync is configured but has never run. Open the sheet and choose
        MarsWorks &rsaquo; Set up sync.
      </p>
    );
  }

  const ago = formatDistanceStrict(lastOk.finishedAt, now, { addSuffix: true });
  const staleMinutes = (now.getTime() - lastOk.finishedAt.getTime()) / 60_000;
  const failing = last && !last.ok;

  if (failing || staleMinutes > 20) {
    return (
      <p className="text-xs text-warning" title="The sheet syncs every 5 minutes when it is working.">
        Google Sheets {failing ? "sync is failing" : "has not synced"}; last good sync {ago}. In the
        sheet, try MarsWorks &rsaquo; Sync now.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-3">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
      Synced with Google Sheets {ago}
    </p>
  );
}

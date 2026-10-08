import { NextResponse } from "next/server";
import { z } from "zod";
import { syncConfigured, syncSecretMatches } from "@/lib/sheets/auth";
import { runSheetSync } from "@/lib/sheets/sync";
import { TAB_TEAM } from "@/lib/sheets/schema";

// A first sync links and writes every row in the sheet; give it room.
export const maxDuration = 60;

const cell = z.union([z.string(), z.number(), z.boolean(), z.null()]).transform((v) => (v === null ? "" : String(v)));

const payload = z.object({
  reason: z.string().max(40).optional(),
  // The status words the sheet's dropdowns accept. Sent by the current script
  // only; an older one omits it and gets the sheet's original three words.
  statusOptions: z.array(z.string().max(40)).max(20).optional(),
  tabs: z
    .array(
      z.object({
        name: z.string().max(200),
        rows: z
          .array(
            z.object({
              row: z.number().int().positive(),
              id: cell.default(""),
              title: cell.default(""),
              assignee: cell.default(""),
              start: cell.default(""),
              end: cell.default(""),
              status: cell.default(""),
              notes: cell.default(""),
            }),
          )
          .max(5000),
      }),
    )
    .max(100),
});

function unauthorised() {
  if (!syncConfigured()) {
    return NextResponse.json(
      { error: "Google Sheets sync is not configured: set SHEETS_SYNC_SECRET in Vercel." },
      { status: 503 },
    );
  }
  return NextResponse.json({ error: "Wrong or missing sync secret." }, { status: 401 });
}

/** Lets the setup script check the URL and secret before it changes anything. */
export async function GET(request: Request) {
  if (!syncSecretMatches(request.headers.get("x-sync-secret"))) return unauthorised();
  return NextResponse.json({ ok: true, tabs: TAB_TEAM });
}

export async function POST(request: Request) {
  if (!syncSecretMatches(request.headers.get("x-sync-secret"))) return unauthorised();

  const parsed = payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid sync payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { ops, summary } = await runSheetSync(
      parsed.data.tabs,
      parsed.data.reason ?? "sheet",
      parsed.data.statusOptions,
    );
    return NextResponse.json({ ok: true, ops, summary });
  } catch (error) {
    console.error("Google Sheets sync failed", error);
    return NextResponse.json({ error: "Sync failed on the website side." }, { status: 500 });
  }
}

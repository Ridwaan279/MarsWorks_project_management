import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Deployment diagnostics. A server component that cannot reach the database
 * renders Next's generic "a server error occurred" page, which says nothing
 * useful to whoever just deployed. This endpoint answers the three questions
 * that actually go wrong, in order, and names the command that fixes each.
 *
 * It deliberately reports no connection string, host, user or password: only
 * whether each stage worked. A misconfigured deployment is often public, and
 * a diagnostic endpoint that leaks credentials is worse than no endpoint.
 */
/**
 * Prisma's driver adapter wraps connection failures as a generic P2010, so the
 * Prisma error code alone cannot tell "wrong password" from "wrong host". The
 * underlying node-postgres error is the thing that actually distinguishes
 * them, and it surfaces in the message chain.
 *
 * Nothing from the raw message is returned to the caller: it can contain the
 * host and user. Only the classification is.
 */
function describeConnectionFailure(error: unknown): string {
  const parts: string[] = [];
  for (let e: unknown = error, depth = 0; e && depth < 5; depth += 1) {
    const err = e as { message?: string; code?: string; cause?: unknown };
    if (err.message) parts.push(err.message);
    if (err.code) parts.push(err.code);
    e = err.cause;
  }
  const text = parts.join(" ").toLowerCase();

  // What the pg adapter actually produces: it flattens the underlying socket
  // error into "Can't reach database server at <host>:<port>" with no cause
  // chain, so this is the branch that fires for a wrong host, a wrong port,
  // and Supabase's IPv6-only direct connection alike.
  if (text.includes("reach database server")) {
    return "Cannot reach the database server at that host and port. On Supabase this is almost always the wrong connection string: use the Session pooler URI from Project Settings > Database, not the direct connection, which is IPv6-only and unreachable from Vercel. Also check the project is not paused.";
  }
  if (text.includes("econnrefused")) {
    return "Nothing is listening at that host and port. On Supabase, use the Session pooler URI from Project Settings > Database, not the direct connection.";
  }
  if (
    text.includes("enotfound") ||
    text.includes("eai_again") ||
    text.includes("getaddrinfo")
  ) {
    return "The hostname does not resolve. Check for a typo, and make sure you copied the pooler host rather than the direct one.";
  }
  if (text.includes("enetunreach") || text.includes("ehostunreach")) {
    return "The host is unreachable, which usually means an IPv6-only direct connection. Supabase's direct connection cannot be reached from Vercel; use the Session pooler URI instead.";
  }
  if (
    text.includes("password authentication failed") ||
    text.includes("sasl") ||
    text.includes("28p01")
  ) {
    return "The password was rejected. The connection string still contains the [YOUR-PASSWORD] placeholder, or the password has characters such as @ : / ? or # that break URL parsing.";
  }
  if (text.includes("does not exist") && text.includes("database")) {
    return "That database name does not exist on the server. On Supabase the database is called `postgres`.";
  }
  if (text.includes("timeout") || text.includes("etimedout")) {
    return "The connection timed out. Check the host and port, and that the database is not paused -- Supabase pauses free projects after about a week of inactivity.";
  }
  return "Could not connect. Check DATABASE_URL against the Session pooler URI in Supabase, and that the project is not paused.";
}

export async function GET() {
  const checks: { name: string; ok: boolean; detail: string }[] = [];

  const hasUrl = Boolean(process.env.DATABASE_URL);
  checks.push({
    name: "DATABASE_URL is set",
    ok: hasUrl,
    detail: hasUrl
      ? "Present in the environment."
      : "Missing. Add it in Vercel under Settings > Environment Variables, ticked for Production, Preview and Development, then redeploy.",
  });

  if (!hasUrl) {
    return NextResponse.json({ ok: false, checks }, { status: 503 });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({
      name: "Database reachable",
      ok: true,
      detail: "Connected successfully.",
    });
  } catch (error) {
    checks.push({
      name: "Database reachable",
      ok: false,
      detail: describeConnectionFailure(error),
    });
    return NextResponse.json({ ok: false, checks }, { status: 503 });
  }

  try {
    const teams = await prisma.team.count();
    const tasks = await prisma.task.count();
    checks.push({
      name: "Schema created",
      ok: true,
      detail: `Tables exist. ${teams} teams, ${tasks} tasks.`,
    });
    if (teams === 0) {
      checks.push({
        name: "Data loaded",
        ok: false,
        detail:
          "Tables are empty. Run `npm run db:seed` locally against this database.",
      });
      return NextResponse.json({ ok: false, checks }, { status: 503 });
    }
    checks.push({ name: "Data loaded", ok: true, detail: `${teams} sub-teams present.` });
  } catch (error) {
    const code = (error as { code?: string }).code;
    checks.push({
      name: "Schema created",
      ok: false,
      detail:
        code === "P2021"
          ? "The tables do not exist. Run `npx prisma db push` locally with DATABASE_URL pointing at this database; the build never touches the database, so it cannot do this for you."
          : `Query failed${code ? ` (${code})` : ""}.`,
    });
    return NextResponse.json({ ok: false, checks }, { status: 503 });
  }

  return NextResponse.json({ ok: true, checks });
}

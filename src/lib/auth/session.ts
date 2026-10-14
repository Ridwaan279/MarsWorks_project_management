/**
 * Who is using the site, for pages and route handlers.
 *
 * The proxy turns away anyone without a valid session cookie before a page or
 * API route runs. This is the second, authoritative check: it reads the member
 * from the database each time, so a role changed on the team list applies at
 * once rather than when their cookie next renews.
 */
import { cookies } from "next/headers";
import { prisma } from "../db";
import { authSetup, SESSION_COOKIE, SESSION_DAYS } from "./config";
import { canDeleteTasks, type Role } from "./roles";
import { signToken, verifyToken, type TokenClaims } from "./token";

export interface SessionClaims extends TokenClaims {
  use: "session";
  /** Member id. */
  sub: string;
}

export interface Viewer {
  /** "off": sign-in not set up yet, so the site is open as before. */
  mode: "off" | "incomplete" | "on";
  member: { id: string; name: string; email: string | null; role: Role } | null;
}

export async function sessionCookieValue(memberId: string, secret: string): Promise<string> {
  return signToken<SessionClaims>(
    { use: "session", sub: memberId, exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400 },
    secret,
  );
}

export async function currentViewer(): Promise<Viewer> {
  const setup = authSetup();
  if (setup.mode !== "on") return { mode: setup.mode, member: null };
  const store = await cookies();
  const claims = await verifyToken<SessionClaims>(store.get(SESSION_COOKIE)?.value, setup.secret, "session");
  if (!claims) return { mode: "on", member: null };
  const member = await prisma.member.findUnique({
    where: { id: claims.sub },
    select: { id: true, name: true, email: true, role: true },
  });
  return { mode: "on", member };
}

/**
 * Whether this viewer may delete tasks. Before sign-in is set up the site is
 * open, as it always was; once it is, only leads and technical advisors may.
 */
export function mayDeleteTasks(viewer: Viewer): boolean {
  if (viewer.mode === "off") return true;
  return canDeleteTasks(viewer.member?.role);
}

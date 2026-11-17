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
  /**
   * Their university address, so the session outlives the member row it was
   * issued for: linking addresses can fold an early account into the
   * person's place on the team list, which has a different id. Absent from
   * sessions issued before it was added.
   */
  email?: string;
}

export interface Viewer {
  /** "off": sign-in not set up yet, so the site is open as before. */
  mode: "off" | "incomplete" | "on";
  guest: boolean;
  member: { id: string; name: string; email: string | null; role: Role; teamId: string | null } | null;
  /**
   * Signed in, but to an account that no longer exists -- removed from the
   * team list, or merged into another before their session carried an
   * address. They can look around but must sign in again to change anything,
   * and are told so rather than left on a site that quietly ignores them.
   */
  stale: boolean;
}

export async function sessionCookieValue(memberId: string, secret: string, email?: string | null): Promise<string> {
  return signToken<SessionClaims>(
    {
      use: "session",
      sub: memberId,
      ...(email ? { email } : {}),
      exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400,
    },
    secret,
  );
}

export async function currentViewer(): Promise<Viewer> {
  const setup = authSetup();
  if (setup.mode !== "on") return { mode: setup.mode, guest: false, member: null, stale: false };
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const guest = await verifyToken(token, setup.secret, "guest");
  if (guest) return { mode: "on", guest: true, member: null, stale: false };
  const claims = await verifyToken<SessionClaims>(token, setup.secret, "session");
  if (!claims || typeof claims.sub !== "string") return { mode: "on", guest: false, member: null, stale: false };
  const select = { id: true, name: true, email: true, role: true, teamId: true } as const;
  const member =
    (await prisma.member.findUnique({ where: { id: claims.sub }, select })) ??
    (typeof claims.email === "string"
      ? await prisma.member.findFirst({ where: { email: { equals: claims.email, mode: "insensitive" } }, select })
      : null);
  return { mode: "on", guest: false, member, stale: member === null };
}

export function mayEditProject(viewer: Viewer): boolean {
  if (viewer.guest) return false;
  return viewer.mode === "off" || (viewer.mode === "on" && viewer.member !== null);
}

/**
 * Whether this viewer may delete tasks. Before sign-in is set up the site is
 * open, as it always was; once it is, only leads and technical advisors may.
 */
export function mayDeleteTasks(viewer: Viewer): boolean {
  if (!mayEditProject(viewer)) return false;
  if (viewer.mode === "off") return true;
  return canDeleteTasks(viewer.member?.role);
}

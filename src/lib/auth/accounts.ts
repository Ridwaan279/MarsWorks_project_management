/**
 * Finding, or making, the member account a Google sign-in belongs to.
 *
 *   1. Their address is on file: that member. This is how everyone on the
 *      team list is meant to be found (docs/sign-in.md loads the addresses).
 *   2. Otherwise one team-list member who has never signed in has their
 *      name (see match.ts): that member, who now has their address on file.
 *   3. Otherwise a new account, as a Team Member with no sub-team. Anyone at
 *      the university may sign in; only the team list makes someone a lead.
 */
import { prisma } from "../db";
import type { Identity } from "./google";
import { matchByName } from "./match";

export async function memberForSignIn(identity: Identity): Promise<{ id: string; created: boolean }> {
  const now = new Date();
  const known = await prisma.member.findFirst({
    where: { email: { equals: identity.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (known) {
    await prisma.member.update({ where: { id: known.id }, data: { lastSignInAt: now } });
    return { id: known.id, created: false };
  }

  const unclaimed = await prisma.member.findMany({
    where: { email: null },
    select: { id: true, name: true },
  });
  const claimed = matchByName(identity, unclaimed);
  if (claimed) {
    await prisma.member.update({
      where: { id: claimed },
      data: { email: identity.email, lastSignInAt: now },
    });
    return { id: claimed, created: false };
  }

  const created = await prisma.member.create({
    data: { name: identity.name, email: identity.email, role: "TEAM_MEMBER", lastSignInAt: now },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

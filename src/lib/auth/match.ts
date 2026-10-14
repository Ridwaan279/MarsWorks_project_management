/**
 * Which team-list member a first sign-in belongs to, when their address is
 * not on file yet.
 *
 * Addresses are the real link (see docs/sign-in.md), but someone added to the
 * team list later will have none. Then the name Google holds for their
 * university account is matched against members who have not signed in yet:
 * the whole name, or the first name among Google's given names and the
 * surname as Google's family name -- "Ridwaan Joomun" is the university's
 * "Mohammad Ridwaan Joomun". Only a single, unclaimed match counts; anything
 * else makes a new account, which a lead can see and sort out.
 */
import { normaliseName } from "../owners";
import type { Identity } from "./google";

export interface Unclaimed {
  id: string;
  name: string;
}

export function matchByName(identity: Identity, unclaimed: readonly Unclaimed[]): string | null {
  const full = normaliseName(identity.name);
  const given = normaliseName(identity.givenName).split(" ").filter(Boolean);
  const family = normaliseName(identity.familyName);

  const matches = unclaimed.filter((member) => {
    const name = normaliseName(member.name);
    if (name === full) return true;
    const parts = name.split(" ");
    if (parts.length < 2 || !family) return false;
    return parts[parts.length - 1] === family && given.includes(parts[0]);
  });
  return matches.length === 1 ? matches[0].id : null;
}

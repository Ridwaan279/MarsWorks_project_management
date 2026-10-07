import { timingSafeEqual } from "node:crypto";

/**
 * Checks the shared secret the Apps Script sends with every sync. Compared in
 * constant time so the response time cannot be used to guess it a character
 * at a time.
 */
export function syncSecretMatches(provided: string | null): boolean {
  const expected = process.env.SHEETS_SYNC_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const syncConfigured = () => Boolean(process.env.SHEETS_SYNC_SECRET);

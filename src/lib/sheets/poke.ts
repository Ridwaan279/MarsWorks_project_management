import { after } from "next/server";

/**
 * Ask the Google Sheet to sync now, after a change made on the website.
 *
 * The sheet syncs itself every few minutes regardless; this just makes a
 * change on the board show up in the sheet within seconds rather than at the
 * next scheduled run. It is optional twice over: without SHEETS_WEBAPP_URL it
 * does nothing, and if the call fails the scheduled run still catches up.
 *
 * Runs after the response has been sent, so dragging a card is never slowed
 * down by a round trip to Google.
 */
export function pokeSheet(reason: string): void {
  const url = process.env.SHEETS_WEBAPP_URL;
  const secret = process.env.SHEETS_SYNC_SECRET;
  if (!url || !secret) return;
  after(async () => {
    try {
      // Apps Script answers a POST with a redirect to the result; following it
      // as a GET is how its web apps are meant to be called.
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, reason }),
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      console.warn("Could not reach the Google Sheet; the scheduled sync will catch up.", error);
    }
  });
}

/**
 * Where "today" comes from.
 *
 * The team is in Sheffield; the server that renders these pages is not. Vercel
 * runs in UTC, so `new Date()` there is an hour behind British Summer Time,
 * and between midnight and 1am BST it still reports yesterday's date. That is
 * the difference between a task being due today and overdue.
 *
 * So the project has one clock, fixed to the team's own timezone, and every
 * "today" is read from it rather than from whatever machine happens to be
 * running the code.
 */
export const PROJECT_TIME_ZONE = "Europe/London";

/**
 * The calendar date in the team's timezone, as YYYY-MM-DD.
 *
 * en-CA is the locale whose short date format is already ISO order, which
 * avoids parsing month names back out of a formatted string.
 */
export function projectDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PROJECT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Today, as an instant at UTC midnight.
 *
 * Planned dates arrive from `<input type="date">` as bare YYYY-MM-DD and are
 * stored as UTC midnight, so anchoring today the same way keeps every
 * comparison between them a comparison of calendar days rather than of
 * moments that happen to be hours apart.
 */
export function projectToday(now: Date = new Date()): Date {
  return new Date(`${projectDateString(now)}T00:00:00.000Z`);
}

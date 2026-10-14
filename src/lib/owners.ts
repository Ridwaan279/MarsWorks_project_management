/**
 * A task's owners as one line of text, and back.
 *
 * The site keeps owners as people (a task's assignees) plus free text for
 * anyone who is not a person on the site: a group ("Executive Team") or a
 * name nobody is listed under. The Google Sheet has a single Assignee cell, so
 * the two are written into it together and read back out of it.
 *
 * Written: the people's full names, alphabetically, then the text, all
 * separated by commas -- "Dexi Li, Kai Dolan, Executive Team".
 *
 * Read: split at commas (and "&", "and", "/", ";", "+"), and each piece that
 * is exactly someone's name, ignoring case and spacing, links that person.
 * Text that names nobody is kept exactly as written, so "Sub-Team Leads &
 * Chief Engineer" is never rewritten. Text that names some people keeps the
 * other pieces as the free text.
 *
 * Kept free of the app's path aliases: the deploy's roster step imports it.
 */

/** "  Kai  Dolan " and "kai dolan" are the same person. */
export function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

const SEPARATORS = /\s*(?:,|;|&|\+|\/|\band\b)\s*/i;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface ReadOwners {
  /** Linked people, without repeats. Unordered: owners are listed by name. */
  memberIds: string[];
  /** Whatever did not name a person; "" when nothing is left. */
  rest: string;
}

/**
 * The people a line of owner text names, and what else it says.
 *
 * `lookup` maps normalised names to member ids. With `scan`, a piece that is
 * not a name is also searched for names run together without separators
 * ("Dexi Li Kai Dolan", as one old planner wrote it); the sheet sync leaves
 * this off, since a group name that happens to contain a person's name
 * should not be split up.
 */
export function readOwners(
  text: string,
  lookup: ReadonlyMap<string, string>,
  options: { scan?: boolean } = {},
): ReadOwners {
  const whole = text.trim();
  if (!whole) return { memberIds: [], rest: "" };

  const memberIds: string[] = [];
  const add = (id: string) => {
    if (!memberIds.includes(id)) memberIds.push(id);
  };
  // Longest first, so "Jack Sutton" is found before an alias like "Jack".
  const names = options.scan ? [...lookup.keys()].sort((a, b) => b.length - a.length) : [];

  const leftover: string[] = [];
  for (const raw of whole.split(SEPARATORS)) {
    const piece = raw.trim().replace(/\s+/g, " ");
    if (!piece) continue;
    const id = lookup.get(normaliseName(piece));
    if (id) {
      add(id);
      continue;
    }
    let remaining = piece;
    for (const name of names) {
      const pattern = new RegExp(`(^|\\s)${escapeRegExp(name)}(?=\\s|$)`, "i");
      if (pattern.test(remaining)) {
        add(lookup.get(name)!);
        remaining = remaining.replace(pattern, " ").replace(/\s+/g, " ").trim();
      }
    }
    if (remaining) leftover.push(remaining);
  }

  // Nobody named: keep the text exactly as written.
  if (memberIds.length === 0) return { memberIds: [], rest: whole };
  return { memberIds, rest: leftover.join(", ") };
}

/** The one-line form: people by full name, alphabetically, then the text. */
export function writeOwners(names: readonly string[], rest: string | null | undefined): string {
  const people = [...names].sort((a, b) => a.localeCompare(b));
  const other = rest?.trim();
  return [...people, ...(other ? [other] : [])].join(", ");
}

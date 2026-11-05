/**
 * What a task shows for each person on it: their first name, which is what
 * the team calls each other -- with their surname's initial as well when
 * someone else on the team list has the same first name ("Jack S", "Jack H"),
 * and their whole name if even that is shared.
 */
export function shortNames(members: readonly { id: string; name: string }[]): Map<string, string> {
  const words = (name: string) => name.trim().split(/\s+/).filter(Boolean);
  const first = (name: string) => words(name)[0] ?? name;
  const withInitial = (name: string) => {
    const parts = words(name);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}` : name;
  };
  const count = (keys: string[]) => {
    const seen = new Map<string, number>();
    for (const key of keys) seen.set(key.toLowerCase(), (seen.get(key.toLowerCase()) ?? 0) + 1);
    return (key: string) => seen.get(key.toLowerCase()) ?? 0;
  };

  const firstCount = count(members.map((m) => first(m.name)));
  const initialCount = count(members.map((m) => withInitial(m.name)));
  return new Map(
    members.map((m) => {
      if (firstCount(first(m.name)) === 1) return [m.id, first(m.name)];
      if (initialCount(withInitial(m.name)) === 1) return [m.id, withInitial(m.name)];
      return [m.id, m.name.trim()];
    }),
  );
}

export interface NamedPerson {
  /** Full name, for the tooltip and screen readers. */
  name: string;
  /** What the label says; see shortNames. */
  short: string;
  /** The person signed in, whose label stands out. */
  you?: boolean;
}

/**
 * The people on a task, ready to label. Whoever is signed in comes first, so
 * their own name is never the one folded into "+2".
 */
export function peopleOn(
  ids: readonly string[],
  members: ReadonlyMap<string, { name: string }>,
  short: ReadonlyMap<string, string>,
  viewerId?: string | null,
): NamedPerson[] {
  const people = ids.flatMap((id) => {
    const member = members.get(id);
    if (!member) return [];
    const words = member.name.trim().split(/\s+/);
    return [{ name: member.name, short: short.get(id) ?? words[0] ?? member.name, you: id === viewerId }];
  });
  return [...people.filter((p) => p.you), ...people.filter((p) => !p.you)];
}

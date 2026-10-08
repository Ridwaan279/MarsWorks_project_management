import type { MemberView, TeamView } from "@/lib/project";

/**
 * A member <select>'s options, grouped by sub-team in the teams' own order.
 *
 * Thirty-odd names in one alphabetical run make the person you want hard to
 * find, and two Jacks impossible to tell apart; under their sub-team both are
 * quick. `first` lifts one sub-team's group to the top -- on a task, its own.
 */
export function MemberOptions({
  members,
  teams,
  first,
}: {
  members: MemberView[];
  teams: TeamView[];
  first?: string | null;
}) {
  const ordered = first
    ? [...teams.filter((t) => t.id === first), ...teams.filter((t) => t.id !== first)]
    : teams;
  const groups = ordered
    .map((team) => ({ label: team.name, people: members.filter((m) => m.teamId === team.id) }))
    .filter((g) => g.people.length > 0);
  const known = new Set(teams.map((t) => t.id));
  const other = members.filter((m) => !m.teamId || !known.has(m.teamId));
  if (other.length > 0) groups.push({ label: "No sub-team", people: other });

  return (
    <>
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.people.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

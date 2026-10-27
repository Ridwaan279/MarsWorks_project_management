/** Missing or retired team assignments fall back to showing all teams. */
export function initialTeamFilter(teamId: string | undefined, teams: readonly { id: string }[]): string[] {
  return teamId && teams.some((team) => team.id === teamId) ? [teamId] : [];
}

/** Ridwaan coordinates across teams, so his initial view includes everyone. */
export function defaultTeamId(member: { name: string; teamId: string | null } | null): string | undefined {
  if (member?.name.trim().toLowerCase() === "ridwaan joomun") return undefined;
  return member?.teamId ?? undefined;
}

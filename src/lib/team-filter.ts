/** Missing or retired team assignments fall back to showing all teams. */
export function initialTeamFilter(teamId: string | undefined, teams: readonly { id: string }[]): string[] {
  return teamId && teams.some((team) => team.id === teamId) ? [teamId] : [];
}

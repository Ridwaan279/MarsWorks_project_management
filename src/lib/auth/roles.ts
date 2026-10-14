/**
 * What each role on the team may do. Kept free of server-only imports, so the
 * board can hide what the server would refuse.
 */
export type Role = "PROJECT_LEAD" | "TEAM_LEAD" | "TECHNICAL_ADVISOR" | "TEAM_MEMBER";

export const ROLE_LABEL: Record<Role, string> = {
  PROJECT_LEAD: "Project Lead",
  TEAM_LEAD: "Team Lead",
  TECHNICAL_ADVISOR: "Technical Advisor",
  TEAM_MEMBER: "Team Member",
};

/** Deleting a task cannot be undone, so it is kept to leads and advisors. */
const MAY_DELETE: ReadonlySet<Role> = new Set(["PROJECT_LEAD", "TEAM_LEAD", "TECHNICAL_ADVISOR"]);

export function canDeleteTasks(role: Role | null | undefined): boolean {
  return role ? MAY_DELETE.has(role) : false;
}

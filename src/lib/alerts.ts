/**
 * What to tell someone when they open the site.
 *
 * - Sub-team leads: every task in their sub-team that is blocking another,
 *   with its priority, for as long as it does. Project leads also hear about
 *   blockers in sub-teams that have no team lead, so none go unseen.
 * - Anyone: notices kept for them, such as a task of theirs no longer being
 *   blocked (src/lib/blocking.ts), until they dismiss them.
 */
import { prisma } from "./db";
import { TASK_PRIORITIES, type TaskPriority, type TaskStatus } from "./domain";
import type { Role } from "./auth/roles";

export interface BlockerAlert {
  id: string;
  key: string;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  teamName: string;
  /** The Blocked tasks waiting on it. */
  blocking: { id: string; key: string; title: string; teamName: string }[];
}

export interface Notice {
  id: string;
  message: string;
  taskId: string | null;
}

export interface Alerts {
  blockers: BlockerAlert[];
  notices: Notice[];
}

export const NO_ALERTS: Alerts = { blockers: [], notices: [] };

/** The sub-teams whose blockers this person is told about. */
async function teamsWatchedBy(member: { role: Role; teamId: string | null }): Promise<string[]> {
  const teams = new Set<string>();
  if (member.role === "TEAM_LEAD" && member.teamId) teams.add(member.teamId);
  if (member.role === "PROJECT_LEAD") {
    const led = await prisma.member.findMany({
      where: { role: "TEAM_LEAD", teamId: { not: null } },
      select: { teamId: true },
      distinct: ["teamId"],
    });
    const ledIds = new Set(led.map((m) => m.teamId));
    const all = await prisma.team.findMany({ select: { id: true } });
    for (const team of all) if (!ledIds.has(team.id)) teams.add(team.id);
  }
  return [...teams];
}

export async function alertsFor(member: { id: string; role: Role; teamId: string | null } | null): Promise<Alerts> {
  if (!member) return NO_ALERTS;
  const teamIds = await teamsWatchedBy(member);
  const stillBlocking = { blocking: true, successor: { status: "BLOCKED" as const } };
  const [tasks, notices] = await Promise.all([
    teamIds.length === 0
      ? []
      : prisma.task.findMany({
          where: {
            teamId: { in: teamIds },
            status: { notIn: ["DONE", "IN_REVIEW"] },
            blocks: { some: stillBlocking },
          },
          select: {
            id: true,
            key: true,
            title: true,
            priority: true,
            status: true,
            team: { select: { name: true } },
            blocks: {
              where: stillBlocking,
              select: { successor: { select: { id: true, key: true, title: true, team: { select: { name: true } } } } },
            },
          },
        }),
    prisma.notification.findMany({
      where: { memberId: member.id, seenAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, message: true, taskId: true },
    }),
  ]);
  // Most urgent first.
  const rank = (p: string) => -TASK_PRIORITIES.indexOf(p as TaskPriority);
  const blockers = tasks
    .map((t) => ({
      id: t.id,
      key: t.key,
      title: t.title,
      priority: t.priority as TaskPriority,
      status: t.status as TaskStatus,
      teamName: t.team.name,
      blocking: t.blocks.map((b) => ({ ...b.successor, teamName: b.successor.team.name })),
    }))
    .sort((a, b) => rank(a.priority) - rank(b.priority) || a.key.localeCompare(b.key, undefined, { numeric: true }));
  return { blockers, notices };
}

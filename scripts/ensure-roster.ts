/**
 * Brings the database's sub-teams and members up to the lists in
 * prisma/sub-teams.ts and prisma/members.ts.
 *
 * Production deploys run this straight after the schema push (see
 * scripts/sync-schema.mjs), so a sub-team or person added to those lists
 * appears on the site with the deploy that adds them. Run it by hand against
 * another database with `npm run db:ensure-roster`.
 *
 * It adds, with two exceptions. A member still known by a short name from the
 * old planners ("Matt"), in the same sub-team, is given their full name ("Matt
 * Shepherd") instead of being added a second time, so the tasks already
 * assigned to them stay theirs. And a sub-team listed as retired is deleted,
 * but only while it has no tasks, since they would be deleted with it.
 * Otherwise a sub-team or member that already exists is left as it is --
 * names, colours, order and teams may have been changed on purpose -- except
 * for roles, which always follow the team list, since they decide who may
 * delete tasks.
 *
 * It also keeps tasks' owners in the shape the site now uses: any number of
 * people, plus text for groups. A task's old single assignee joins its list
 * of assignees (and the old column is emptied, so this happens once), and
 * owner text that names people -- "Owen & Jack", or a short name like
 * "Daniel" left over from the planners -- becomes those people, keeping only
 * the rest as text. Short names count only within the task's own sub-team.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { loadLocalEnv } from "./load-env";
import { PrismaClient } from "../src/generated/prisma";
import { RETIRED_SUB_TEAMS, SUB_TEAMS } from "../prisma/sub-teams";
import { MEMBERS } from "../prisma/members";
import { normaliseName, readOwners } from "../src/lib/owners";
import type { MemberRole } from "../src/generated/prisma";

const ROLE_LABEL: Record<MemberRole, string> = {
  PROJECT_LEAD: "Project Lead",
  TEAM_LEAD: "Team Lead",
  TECHNICAL_ADVISOR: "Technical Advisor",
  TEAM_MEMBER: "Team Member",
};

loadLocalEnv();

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[roster] Neither DIRECT_URL nor DATABASE_URL is set.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 2 }),
});

/** Held for the transaction, so two deploys at once cannot both add someone. */
const ROSTER_LOCK = 0x705e7;

/** "  Kai  Dolan " and "kai dolan" are the same person. */
const sameName = normaliseName;

async function main() {
  const report = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(${ROSTER_LOCK})`;

    // Sub-teams first: members belong to them.
    const teams = await tx.team.findMany({ select: { id: true, key: true, position: true } });
    const haveTeam = new Set(teams.map((t) => t.key));
    const newTeams = SUB_TEAMS.filter((t) => !haveTeam.has(t.key));
    if (newTeams.length) {
      // After whatever is there now, in the list's order.
      let position = Math.max(-1, ...teams.map((t) => t.position)) + 1;
      await tx.team.createMany({ data: newTeams.map((t) => ({ ...t, position: position++ })) });
    }
    // Retired sub-teams go only while empty; see RETIRED_SUB_TEAMS.
    const retired: string[] = [];
    const stillInUse: string[] = [];
    for (const key of RETIRED_SUB_TEAMS) {
      const team = await tx.team.findUnique({
        where: { key },
        select: { id: true, name: true, _count: { select: { tasks: true } } },
      });
      if (!team) continue;
      if (team._count.tasks > 0) {
        stillInUse.push(`${team.name} (${team._count.tasks} task(s))`);
        continue;
      }
      await tx.team.delete({ where: { id: team.id } });
      retired.push(team.name);
    }

    const teamIdByKey = new Map(
      (await tx.team.findMany({ select: { id: true, key: true } })).map((t) => [t.key, t.id]),
    );

    const existing = await tx.member.findMany({
      select: { id: true, name: true, teamId: true, role: true },
    });
    const byName = new Map(existing.map((m) => [sameName(m.name), m]));
    const renamed: string[] = [];
    const added: { name: string; teamId: string | null; role: MemberRole }[] = [];
    const roleChanges: string[] = [];

    for (const person of MEMBERS) {
      const role = person.role ?? "TEAM_MEMBER";
      const current = byName.get(sameName(person.name));
      if (current) {
        // Roles follow the team list: promoting someone is a change there.
        if (current.id && current.role !== role) {
          await tx.member.update({ where: { id: current.id }, data: { role } });
          roleChanges.push(`${person.name}: ${ROLE_LABEL[role]}`);
        }
        continue;
      }
      const teamId = teamIdByKey.get(person.team) ?? null;
      const earlier = (person.aliases ?? [])
        .map((alias) => byName.get(sameName(alias)))
        .find((m) => m && m.teamId === teamId);
      if (earlier) {
        await tx.member.update({ where: { id: earlier.id }, data: { name: person.name, role } });
        byName.delete(sameName(earlier.name));
        byName.set(sameName(person.name), { ...earlier, name: person.name, role });
        renamed.push(`${earlier.name} -> ${person.name}`);
      } else {
        added.push({ name: person.name, teamId, role });
        byName.set(sameName(person.name), { id: "", name: person.name, teamId, role });
      }
    }
    if (added.length) await tx.member.createMany({ data: added });

    // Owners: one assignee becomes a list, and people named in owner text
    // become assignees. See the note at the top.
    const people = await tx.member.findMany({ select: { id: true, name: true, teamId: true } });
    const fullNames = new Map(people.map((m) => [sameName(m.name), m.id]));
    const shortNamesByTeam = new Map<string, Map<string, string>>();
    for (const person of MEMBERS) {
      const member = people.find((m) => sameName(m.name) === sameName(person.name));
      if (!member?.teamId || !person.aliases?.length) continue;
      const names = shortNamesByTeam.get(member.teamId) ?? new Map<string, string>();
      for (const alias of person.aliases) names.set(sameName(alias), member.id);
      shortNamesByTeam.set(member.teamId, names);
    }
    const legacy = await tx.task.findMany({
      where: { OR: [{ assigneeId: { not: null } }, { ownerLabel: { not: null } }] },
      select: {
        id: true,
        teamId: true,
        assigneeId: true,
        ownerLabel: true,
        assignees: { select: { id: true } },
      },
    });
    let assigneesMoved = 0;
    let ownersRead = 0;
    for (const task of legacy) {
      const ids = new Set(task.assignees.map((a) => a.id));
      if (task.assigneeId) ids.add(task.assigneeId);
      let ownerLabel = task.ownerLabel;
      if (ownerLabel) {
        // Full names win over short ones.
        const lookup = new Map([...(shortNamesByTeam.get(task.teamId) ?? []), ...fullNames]);
        const read = readOwners(ownerLabel, lookup, { scan: true });
        if (read.memberIds.length > 0) {
          for (const id of read.memberIds) ids.add(id);
          ownerLabel = read.rest || null;
        }
      }
      if (task.assigneeId === null && ownerLabel === task.ownerLabel && ids.size === task.assignees.length) {
        continue;
      }
      await tx.task.update({
        where: { id: task.id },
        data: { assigneeId: null, ownerLabel, assignees: { set: [...ids].map((id) => ({ id })) } },
      });
      if (task.assigneeId) assigneesMoved += 1;
      if (ownerLabel !== task.ownerLabel) ownersRead += 1;
    }

    return { newTeams, retired, stillInUse, renamed, added, roleChanges, assigneesMoved, ownersRead };
  }, { timeout: 60_000, maxWait: 15_000 });

  console.log(
    report.newTeams.length
      ? `[roster] Added sub-teams: ${report.newTeams.map((t) => `${t.name} (${t.key})`).join(", ")}.`
      : `[roster] All ${SUB_TEAMS.length} sub-teams are present.`,
  );
  if (report.retired.length) {
    console.log(`[roster] Removed retired sub-team(s): ${report.retired.join(", ")}.`);
  }
  if (report.stillInUse.length) {
    console.warn(
      `[roster] Not removed, because tasks still belong to them: ${report.stillInUse.join(", ")}.\n` +
        "[roster] Move those tasks to another sub-team or delete them; the next deploy removes it.",
    );
  }
  if (report.renamed.length) {
    console.log(`[roster] Gave ${report.renamed.length} member(s) their full name: ${report.renamed.join(", ")}.`);
  }
  console.log(
    report.added.length
      ? `[roster] Added ${report.added.length} member(s): ${report.added.map((m) => m.name).join(", ")}.`
      : `[roster] All ${MEMBERS.length} members are present.`,
  );
  if (report.roleChanges.length) {
    console.log(`[roster] Roles from the team list: ${report.roleChanges.join(", ")}.`);
  }
  if (report.assigneesMoved || report.ownersRead) {
    console.log(
      `[roster] Owners: moved ${report.assigneesMoved} task(s) to the assignee list; ` +
        `turned the people named in ${report.ownersRead} task(s)' owner text into assignees.`,
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("[roster] Could not bring the sub-teams and members up to date:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

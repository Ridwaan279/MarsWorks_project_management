/**
 * Brings the database's sub-teams and members up to the lists in
 * prisma/sub-teams.ts and prisma/members.ts.
 *
 * Production deploys run this straight after the schema push (see
 * scripts/sync-schema.mjs), so a sub-team or person added to those lists
 * appears on the site with the deploy that adds them. Run it by hand against
 * another database with `npm run db:ensure-roster`.
 *
 * It only ever adds, with one exception: a member still known by a short name
 * from the old planners ("Matt"), in the same sub-team, is given their full
 * name ("Matt Shepherd") instead of being added a second time, so the tasks
 * already assigned to them stay theirs. Otherwise a sub-team or member that
 * already exists is left exactly as it is -- names, colours, order and teams
 * may have been changed on purpose -- and nothing is ever removed, since tasks
 * would go with it.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { loadLocalEnv } from "./load-env";
import { PrismaClient } from "../src/generated/prisma";
import { SUB_TEAMS } from "../prisma/sub-teams";
import { MEMBERS } from "../prisma/members";

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
const sameName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

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
    const teamIdByKey = new Map(
      (await tx.team.findMany({ select: { id: true, key: true } })).map((t) => [t.key, t.id]),
    );

    const existing = await tx.member.findMany({ select: { id: true, name: true, teamId: true } });
    const byName = new Map(existing.map((m) => [sameName(m.name), m]));
    const renamed: string[] = [];
    const added: { name: string; teamId: string | null }[] = [];

    for (const person of MEMBERS) {
      if (byName.has(sameName(person.name))) continue;
      const teamId = teamIdByKey.get(person.team) ?? null;
      const earlier = (person.aliases ?? [])
        .map((alias) => byName.get(sameName(alias)))
        .find((m) => m && m.teamId === teamId);
      if (earlier) {
        await tx.member.update({ where: { id: earlier.id }, data: { name: person.name } });
        byName.delete(sameName(earlier.name));
        byName.set(sameName(person.name), { ...earlier, name: person.name });
        renamed.push(`${earlier.name} -> ${person.name}`);
      } else {
        added.push({ name: person.name, teamId });
        byName.set(sameName(person.name), { id: "", name: person.name, teamId });
      }
    }
    if (added.length) await tx.member.createMany({ data: added });

    return { newTeams, renamed, added };
  });

  console.log(
    report.newTeams.length
      ? `[roster] Added sub-teams: ${report.newTeams.map((t) => `${t.name} (${t.key})`).join(", ")}.`
      : `[roster] All ${SUB_TEAMS.length} sub-teams are present.`,
  );
  if (report.renamed.length) {
    console.log(`[roster] Gave ${report.renamed.length} member(s) their full name: ${report.renamed.join(", ")}.`);
  }
  console.log(
    report.added.length
      ? `[roster] Added ${report.added.length} member(s): ${report.added.map((m) => m.name).join(", ")}.`
      : `[roster] All ${MEMBERS.length} members are present.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("[roster] Could not bring the sub-teams and members up to date:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

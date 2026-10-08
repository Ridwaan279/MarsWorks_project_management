/**
 * Adds any sub-team from prisma/sub-teams.ts that the database is missing.
 *
 * Production deploys run this straight after the schema push (see
 * scripts/sync-schema.mjs), so a sub-team added to that list appears on the
 * site with the deploy that adds it. Run it by hand against another database
 * with `npm run db:ensure-teams`.
 *
 * It only ever adds. A sub-team that already exists is left exactly as it is
 * -- its name, colour or order may have been changed on purpose -- and one
 * missing from the list is never removed, since its tasks would go with it.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { loadLocalEnv } from "./load-env";
import { PrismaClient } from "../src/generated/prisma";
import { SUB_TEAMS } from "../prisma/sub-teams";

loadLocalEnv();

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[teams] Neither DIRECT_URL nor DATABASE_URL is set.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 2 }),
});

async function main() {
  const existing = await prisma.team.findMany({ select: { key: true, position: true } });
  const have = new Set(existing.map((t) => t.key));
  const missing = SUB_TEAMS.filter((t) => !have.has(t.key));
  if (missing.length === 0) {
    console.log(`[teams] All ${SUB_TEAMS.length} sub-teams are present.`);
    return;
  }

  // After whatever is there now, in the list's order.
  let position = Math.max(-1, ...existing.map((t) => t.position)) + 1;
  // skipDuplicates: two deploys racing each other must not fail on the key.
  await prisma.team.createMany({
    data: missing.map((t) => ({ ...t, position: position++ })),
    skipDuplicates: true,
  });
  console.log(`[teams] Added ${missing.map((t) => `${t.name} (${t.key})`).join(", ")}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("[teams] Could not add the missing sub-teams:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

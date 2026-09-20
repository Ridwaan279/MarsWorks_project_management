/**
 * Prints the sub-teams in whichever database the current environment points
 * at, and which connection string it used.
 *
 * Sub-teams are rows, not code, so "the names are wrong" is almost always a
 * question of which database was seeded rather than which code is deployed.
 * This answers that without opening a SQL console.
 *
 *   npm run db:teams
 */
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // rely on the ambient environment
}

const usingDirect = Boolean(process.env.DIRECT_URL);
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Neither DIRECT_URL nor DATABASE_URL is set.");
  process.exit(1);
}

/** Host and database only. The password must never reach a terminal log. */
function describe(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "unparseable connection string";
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 2 }),
});

async function main() {
  console.log(
    `Reading ${describe(connectionString!)} via ${usingDirect ? "DIRECT_URL" : "DATABASE_URL"}\n`,
  );
  const teams = await prisma.team.findMany({
    orderBy: { position: "asc" },
    include: { _count: { select: { tasks: true } } },
  });

  if (teams.length === 0) {
    console.log("No sub-teams. This database has not been seeded.");
  } else {
    for (const team of teams) {
      console.log(
        `  ${team.position}  ${team.key.padEnd(6)} ${team.name.padEnd(20)} ${team._count.tasks} tasks`,
      );
    }
  }
  console.log(`\n${teams.length} sub-teams. Expected 6.`);
  if (teams.length !== 6) {
    console.log(
      "Not 6 -- this database still holds the old seed. Either `git pull` and\n" +
        "run `npm run db:seed` again, or run scripts/fix-subteams.sql against it.",
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

/**
 * Bring the production database's schema, and its list of sub-teams, up to
 * date before a deploy.
 *
 * Every column added so far has needed someone to remember `npx prisma db
 * push` by hand, and forgetting it does not degrade gracefully: Prisma reads
 * every column of a row, so one missing column fails every page on the site.
 * Doing it in the build closes that gap.
 *
 * Deliberately narrow:
 *
 * - Production Vercel builds only. A local `npm run build` reads .env, where
 *   DIRECT_URL may well point at the shared Supabase database, and a build on
 *   someone's laptop should never alter it. Preview builds share production's
 *   variables, so they are excluded for the same reason.
 * - DIRECT_URL is required there. Schema changes need Supabase's session
 *   pooler; the transaction pooler the app runs on cannot hold the locks.
 *   Without it the build stops instead of shipping unchecked.
 * - No --accept-data-loss. `db push` applies additive changes on its own and
 *   refuses anything destructive when nobody is there to confirm it, which
 *   fails the build -- the right outcome, since the old deployment keeps
 *   serving while a person decides.
 */
import { spawnSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production") {
  console.log("[schema] Not a production Vercel build; leaving the database alone.");
  process.exit(0);
}

if (!process.env.DIRECT_URL) {
  // Stop rather than warn. Shipping without knowing the schema matches would
  // risk a site where every page fails; stopping keeps the previous deployment
  // live until someone adds the variable.
  console.error(
    "\n[schema] DIRECT_URL is not set, so this deploy cannot check or update the\n" +
      "[schema] database schema, and has been stopped. The previous deployment is\n" +
      "[schema] still live.\n" +
      "[schema] Fix: in Vercel, Settings > Environment Variables, add DIRECT_URL\n" +
      "[schema] (Production) = Supabase's Session pooler connection string, port 5432\n" +
      "[schema] (Project Settings > Database > Connection string > Session pooler).\n" +
      "[schema] Then redeploy.\n",
  );
  process.exit(1);
}

console.log("[schema] Applying schema changes to the production database...");
const result = spawnSync("npx", ["prisma", "db", "push"], { stdio: "inherit" });
if (result.status !== 0) {
  console.error(
    "\n[schema] `prisma db push` failed, so this deploy was stopped before it could\n" +
      "[schema] ship code that expects a schema the database does not have. The\n" +
      "[schema] previous deployment is still live. See the output above.\n",
  );
  process.exit(result.status ?? 1);
}
console.log("[schema] Database schema is up to date.");

// Sub-teams are rows, so a new one in prisma/sub-teams.ts needs adding to the
// database as well as the code. Only ever adds; see the script.
const teams = spawnSync("npx", ["tsx", "scripts/ensure-sub-teams.ts"], { stdio: "inherit" });
if (teams.status !== 0) {
  console.error(
    "\n[teams] Could not add the missing sub-teams, so this deploy was stopped. The\n" +
      "[teams] previous deployment is still live. See the output above.\n",
  );
  process.exit(teams.status ?? 1);
}

/**
 * Bring the production database's schema up to date before a deploy.
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
 * - Only when DIRECT_URL is set. Schema changes need Supabase's session
 *   pooler; the transaction pooler the app runs on cannot hold the locks.
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
  console.warn(
    "\n[schema] WARNING: DIRECT_URL is not set, so the database schema was NOT updated.\n" +
      "[schema] If this deploy adds columns, every page will fail until you either set\n" +
      "[schema] DIRECT_URL (Supabase session pooler, port 5432) in Vercel and redeploy,\n" +
      "[schema] or run `npx prisma db push` locally against the production database.\n",
  );
  process.exit(0);
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

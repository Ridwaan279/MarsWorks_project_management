import path from "node:path";
import { defineConfig } from "prisma/config";
import { loadLocalEnv } from "./scripts/load-env";

// Prisma 7 no longer auto-loads .env. A missing file is fine in hosted
// environments, where the variables are already present.
loadLocalEnv();

// Migrations and seeding need a session-mode connection: DDL and Prisma's
// advisory locks do not survive a transaction pooler. DIRECT_URL, when set,
// points at Supabase's session pooler (port 5432) while the application
// itself runs against the transaction pooler (port 6543), which tolerates far
// more concurrent clients.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  // Only `migrate`, `db push` and `studio` need a connection string;
  // `prisma generate` does not. Declaring it unconditionally would make a CI
  // build fail before the environment variables are wired up, with an error
  // that points at the config file rather than at the missing variable.
  ...(url ? { datasource: { url } } : {}),
});

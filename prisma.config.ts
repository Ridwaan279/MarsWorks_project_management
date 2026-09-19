import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer auto-loads .env. Node's own loader is enough here and
// keeps dotenv out of the dependency tree. In hosted environments (Vercel)
// DATABASE_URL is already present, so a missing file is not an error.
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // no local .env — rely on the real environment
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});

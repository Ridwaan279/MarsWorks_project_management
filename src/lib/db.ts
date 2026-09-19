import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";

// Next's dev server re-evaluates modules on every edit. Without this the
// process accumulates connection pools until Postgres refuses new clients.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * How many connections one instance of this process may hold.
 *
 * node-postgres defaults to 10 per pool, and a serverless platform runs many
 * isolated instances that each get their own pool. Supabase's session pooler
 * allows 15 clients for the whole project, so two concurrent instances on the
 * default can consume every slot -- which locks out `prisma db push` and any
 * other client with `max clients reached in session mode`.
 *
 * Three is the default on a serverless host. One would be tidier if each
 * instance only ever served a single request, but Vercel's fluid compute runs
 * several concurrently on one instance, and a pool of one serialises them
 * behind a single connection. Three leaves room for that while staying far
 * below the ten that caused the problem.
 */
function poolMax(): number {
  const configured = Number(process.env.DATABASE_POOL_MAX);
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  return process.env.VERCEL ? 3 : 5;
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at your database.",
    );
  }
  const client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: poolMax(),
      // Hand connections back quickly rather than holding a pooler slot idle
      // between requests.
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000,
    }),
  });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

/**
 * The one client for this process, created on first use and then reused.
 *
 * Module scope, not the dev global: the global is only populated outside
 * production, so resolving through it alone meant every property access in
 * production built a fresh client and a fresh connection pool. That exhausts
 * a pooler in seconds -- it is pools per query, not per instance.
 */
let client: PrismaClient | undefined;

function getClient(): PrismaClient {
  if (client) return client;
  client = globalForPrisma.prisma ?? createClient();
  return client;
}

/**
 * Built on first use rather than at import time. `next build` imports every
 * route module to collect page data, so eagerly constructing the client would
 * make the build itself require a database -- and fail a deploy whose
 * environment variables are not wired up yet. This way a missing DATABASE_URL
 * surfaces on the first request, with a message that says what to do.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const active = getClient();
    const value = Reflect.get(active, property, active);
    return typeof value === "function" ? value.bind(active) : value;
  },
});

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";

// Next's dev server re-evaluates modules on every edit. Without this the
// process accumulates connection pools until Postgres refuses new clients.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at your database.",
    );
  }
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
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
    const client = globalForPrisma.prisma ?? createClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Prisma engine is a native binary; bundling it breaks the server build.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],
};

export default nextConfig;

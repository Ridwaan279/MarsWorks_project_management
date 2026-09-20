"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Replaces Next's generic production error page. The overwhelmingly common
 * cause of a 500 here is a deployment whose database is not set up yet, so
 * point at the health check rather than leaving whoever deployed it guessing.
 *
 * The error's own message is not rendered: in production it could carry
 * connection details, and Next redacts it to a digest anyway.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page failed to render", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-6 py-20">
      <h1 className="text-lg font-semibold">Mission Control could not load</h1>
      <p className="mt-2 text-sm text-ink-muted">
        The page failed on the server. This is nearly always the database: either
        it is unreachable, or its tables have not been created yet.
      </p>

      <div className="mt-6 rounded-xl border border-edge bg-surface p-4">
        <h2 className="text-sm font-medium">Find out which</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Open{" "}
          <Link href="/api/health" className="text-mars-soft hover:underline">
            /api/health
          </Link>
          . It checks the connection string, the database and the schema in turn,
          and names the command that fixes whichever one failed.
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-mars px-3 py-1.5 text-sm font-medium text-ground transition-opacity hover:opacity-90"
        >
          Try again
        </button>
        {error.digest ? (
          <span className="font-mono text-xs text-ink-faint">
            digest {error.digest}
          </span>
        ) : null}
      </div>
    </div>
  );
}

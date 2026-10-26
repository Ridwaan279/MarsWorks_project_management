import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ALLOWED_DOMAIN, authSetup, safeNext } from "@/lib/auth/config";
import { currentViewer } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  domain: `That isn't a University of Sheffield account. Sign in with your @${ALLOWED_DOMAIN} address.`,
  cancelled: "Sign-in was cancelled.",
  expired: "That sign-in took too long or was already used. Please try again.",
  failed: "Google couldn't sign you in just now. Please try again.",
  setup: "Sign-in isn't fully set up on this site yet. Ask a project lead.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; signedOut?: string }>;
}) {
  const [params, viewer] = await Promise.all([searchParams, currentViewer()]);
  const next = safeNext(params.next);
  if (viewer.member || viewer.mode === "off") redirect(next);

  const setup = authSetup();
  const message = params.error ? (MESSAGES[params.error] ?? MESSAGES.failed) : null;

  return (
    <div className="grid min-h-[calc(100dvh-3.5rem)] place-items-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-line bg-panel p-6 shadow-xl shadow-black/20">
        <div className="space-y-3 text-center">
          <Image
            src="/marsworks-logo.png"
            alt=""
            width={56}
            height={56}
            priority
            className="mx-auto h-14 w-14"
          />
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-ink text-balance">Sign in to Mission Control</h1>
            <p className="text-sm text-ink-2 text-pretty">
              Use your University of Sheffield account, the one ending in{" "}
              <span className="font-medium text-ink">@{ALLOWED_DOMAIN}</span>.
            </p>
          </div>
        </div>

        {message ? (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {message}
          </p>
        ) : params.signedOut ? (
          <p role="status" className="rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink-2">
            You&apos;ve signed out.
          </p>
        ) : null}

        {setup.mode === "on" ? (
          <a
            href={`/api/auth/login?next=${encodeURIComponent(next)}`}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-elevated px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <svg viewBox="0 0 48 48" aria-hidden className="h-4 w-4">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5Z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7Z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44Z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5Z" />
            </svg>
            Sign in with Google
          </a>
        ) : null}

        <p className="text-center text-xs text-ink-3 text-pretty">
          Everyone on the team list has an account already: signing in finds it.
        </p>
        <p className="text-center text-xs text-ink-3">
          <Link href="/privacy" className="rounded underline underline-offset-4 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            Privacy policy
          </Link>
        </p>
      </div>
    </div>
  );
}

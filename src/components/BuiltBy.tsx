import clsx from "clsx";

export const BUILDER_NAME = "Ridwaan Joomun";
export const BUILDER_LINKEDIN = "https://www.linkedin.com/in/ridwaan-joomun/";

/** LinkedIn's "in" mark, in the text colour until hovered. */
export function LinkedInMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

/**
 * Who built the site, linking to their LinkedIn. Small and quiet: on the
 * sign-in page, in the header on wide screens, and in the account menu.
 *
 * Where it shows is the caller's: `display` is the class that shows it
 * ("flex", or "hidden xl:flex"). Kept out of the shared classes because a
 * "flex" here would beat a caller's "hidden" -- Tailwind orders by its
 * stylesheet, not by the class list.
 */
export function BuiltBy({ display = "flex", className }: { display?: string; className?: string }) {
  return (
    <p className={clsx(display, "items-center gap-1.5 text-[11px] text-ink-3 italic", className)}>
      <span>
        Built by{" "}
        <a
          href={BUILDER_LINKEDIN}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {BUILDER_NAME}
        </a>
      </span>
      <a
        href={BUILDER_LINKEDIN}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${BUILDER_NAME} on LinkedIn (opens in a new tab)`}
        title="LinkedIn"
        className="rounded text-ink-3 transition-colors hover:text-[#0a66c2] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <LinkedInMark className="h-3.5 w-3.5" />
      </a>
    </p>
  );
}

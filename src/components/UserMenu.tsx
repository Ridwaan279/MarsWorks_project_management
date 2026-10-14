import { Avatar } from "./ui";

/**
 * Who is signed in, and the way out. A native <details> so it opens without
 * JavaScript; signing out is a form POST, which a link from another site
 * cannot trigger.
 */
export function UserMenu({ name, role, email }: { name: string; role: string; email: string | null }) {
  return (
    <details className="group relative">
      <summary
        aria-label={`Signed in as ${name}`}
        title={`Signed in as ${name}`}
        className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden"
      >
        <Avatar name={name} size="md" />
      </summary>
      <div className="absolute top-full right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-panel shadow-xl shadow-black/30">
        <div className="space-y-0.5 border-b border-line px-3 py-2.5">
          <p className="truncate text-sm font-medium text-ink">{name}</p>
          <p className="text-xs text-accent">{role}</p>
          {email ? <p className="truncate text-xs text-ink-3">{email}</p> : null}
        </div>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="w-full px-3 py-2 text-left text-sm text-ink-2 transition-colors hover:bg-elevated hover:text-ink focus:outline-none focus-visible:bg-elevated"
          >
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}

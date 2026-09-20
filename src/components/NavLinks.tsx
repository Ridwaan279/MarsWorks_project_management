"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/teams", label: "Sub-teams" },
  { href: "/board", label: "Board" },
  { href: "/timeline", label: "Timeline" },
  { href: "/impact", label: "Impact" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 sm:gap-1"
    >
      {LINKS.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors sm:px-3",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-info",
              active
                ? "bg-surface-2 text-ink"
                : "text-ink-muted hover:bg-surface hover:text-ink",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
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

function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Five destinations, two shapes.
 *
 * On a wide screen they are tabs, which show where you are and where you could
 * go at a glance. On a phone that strip does not fit: it becomes a sideways
 * scroller where the destinations past "Board" are off-screen with nothing to
 * say so, and each target is too narrow to hit. There it collapses to a single
 * button naming the current page, which opens the full list.
 */
export function NavLinks() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = LINKS.find((l) => isActive(l.href, pathname)) ?? LINKS[0];

  // A tap on a link navigates without unmounting this component, so the menu
  // has to be told to close.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <>
      {/* Phone: one button, the whole list behind it. */}
      <div ref={menuRef} className="relative sm:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Menu — currently on ${current.label}`}
          className="flex items-center gap-1.5 rounded-md bg-elevated px-2.5 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden>
            <path
              d="M2 4h12M2 8h12M2 12h12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span className="max-w-[7.5rem] truncate">{current.label}</span>
        </button>

        {open ? (
          <nav
            aria-label="Main"
            className="absolute top-full left-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-line bg-panel py-1 shadow-xl shadow-black/30"
          >
            {LINKS.map((link) => {
              const active = isActive(link.href, pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex items-center gap-2 px-3 py-2.5 text-sm transition-colors",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                    active
                      ? "bg-elevated font-medium text-ink"
                      : "text-ink-2 hover:bg-elevated hover:text-ink",
                  )}
                >
                  <span
                    aria-hidden
                    className={clsx(
                      "h-4 w-0.5 shrink-0 rounded-full",
                      active ? "bg-accent" : "bg-transparent",
                    )}
                  />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>

      {/* Tablet and up: the tabs, unchanged. */}
      <nav
        aria-label="Main"
        className="-mx-1 hidden min-w-0 items-center gap-0.5 overflow-x-auto px-1 sm:flex sm:gap-1"
      >
        {LINKS.map((link) => {
          const active = isActive(link.href, pathname);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors sm:px-3",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                active
                  ? "bg-elevated text-ink shadow-[inset_0_-2px_0_0_var(--color-accent)]"
                  : "text-ink-2 hover:bg-panel hover:text-ink",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

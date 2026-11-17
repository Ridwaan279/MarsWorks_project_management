"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";

/**
 * The task search box on the board and the timeline. "/" jumps to it from
 * anywhere on the page that is not already a text box, as on GitHub and
 * Slack; Escape clears it.
 */
export function SearchBox({
  value,
  onChange,
  label = "Search tasks",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      event.preventDefault();
      input.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div role="search" className={clsx("relative flex min-w-0 items-center", className)}>
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-ink-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="m10.5 10.5 3 3" />
      </svg>
      <input
        ref={input}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            // Clear first; a second Escape is left to whatever else listens.
            e.stopPropagation();
            onChange("");
          }
        }}
        aria-label={label}
        placeholder="Search tasks"
        autoComplete="off"
        spellCheck={false}
        className="w-full min-w-0 rounded-md border border-line bg-panel py-1.5 pr-14 pl-8 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
          aria-label="Clear the search"
          className="absolute right-1.5 rounded px-1.5 py-0.5 text-[11px] text-ink-3 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Clear
        </button>
      ) : (
        <kbd
          aria-hidden
          className="pointer-events-none absolute right-2 hidden rounded border border-line px-1 text-[10px] text-ink-3 sm:inline"
        >
          /
        </kbd>
      )}
    </div>
  );
}

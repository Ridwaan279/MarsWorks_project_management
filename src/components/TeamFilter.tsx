"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { TeamView } from "@/lib/project";
import { TeamDot } from "./ui";

/**
 * Pick any combination of sub-teams.
 *
 * A `<select>` can do multiple with the right attribute, but the native
 * multi-select is a scrolling list box that needs ctrl-click to add a second
 * choice and is close to unusable on a phone. This is a plain popover of
 * checkboxes instead.
 *
 * Empty means every team, rather than none. It is the state the page opens in,
 * and "no filter" is what people mean when they clear one.
 */
export function TeamFilter({
  teams,
  selected,
  onChange,
  id,
}: {
  teams: TeamView[];
  /** Selected team ids. Empty selects everything. */
  selected: string[];
  onChange: (next: string[]) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const chosen = teams.filter((t) => selected.includes(t.id));
  const label =
    chosen.length === 0
      ? "All teams"
      : chosen.length === 1
        ? chosen[0].name
        : `${chosen.length} teams`;

  function toggle(teamId: string) {
    onChange(
      selected.includes(teamId)
        ? selected.filter((id) => id !== teamId)
        : [...selected, teamId],
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1.5 text-xs text-ink transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {/* A dot each, so a two-team selection is readable without opening. */}
        {chosen.length > 0 && chosen.length <= 3 ? (
          <span className="flex items-center gap-1">
            {chosen.map((team) => (
              <TeamDot key={team.id} colour={team.colour} />
            ))}
          </span>
        ) : null}
        <span className="max-w-[9rem] truncate">{label}</span>
        <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 text-ink-3" fill="currentColor" aria-hidden>
          <path d="M4 6l4 4 4-4H4Z" />
        </svg>
      </button>

      {open ? (
        <div
          role="group"
          aria-label="Sub-teams to show"
          className="absolute top-full left-0 z-50 mt-1.5 w-56 rounded-xl border border-line bg-panel py-1 shadow-xl shadow-black/30"
        >
          <button
            type="button"
            onClick={() => onChange([])}
            className={clsx(
              "flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-elevated",
              selected.length === 0 ? "text-ink" : "text-ink-2",
            )}
          >
            <span
              aria-hidden
              className={clsx(
                "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm ring-1",
                selected.length === 0
                  ? "bg-accent ring-accent"
                  : "ring-line",
              )}
            >
              {selected.length === 0 ? (
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white" fill="currentColor" aria-hidden>
                  <path d="M10 3 4.5 8.5 2 6l1-1 1.5 1.5L9 2l1 1Z" />
                </svg>
              ) : null}
            </span>
            All teams
          </button>

          <div className="my-1 border-t border-line" />

          {teams.map((team) => {
            const on = selected.includes(team.id);
            return (
              <label
                key={team.id}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-ink-2 transition-colors hover:bg-elevated hover:text-ink"
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(team.id)}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--color-accent)]"
                />
                <TeamDot colour={team.colour} />
                <span className="min-w-0 flex-1 truncate">{team.name}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

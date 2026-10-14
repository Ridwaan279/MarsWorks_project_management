"use client";

import clsx from "clsx";
import type { MemberView, TeamView } from "@/lib/project";
import { MemberOptions } from "./MemberOptions";

/**
 * Pick any number of people to assign.
 *
 * The task's own sub-team is laid out as buttons to tick, since that is who
 * almost every task goes to and it is six or seven names. Anyone from another
 * sub-team is a deliberate step, through the list underneath, and shows up
 * among the picked with a way to take them off again.
 */
export function AssigneePicker({
  id,
  members,
  teams,
  teamId,
  value,
  onChange,
}: {
  id: string;
  members: MemberView[];
  teams: TeamView[];
  /** The task's sub-team, whose people are offered first. */
  teamId: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const chosen = new Set(value);
  const own = members.filter((m) => m.teamId === teamId);
  const others = members.filter((m) => m.teamId !== teamId);
  const chosenElsewhere = others.filter((m) => chosen.has(m.id));
  const teamName = teams.find((t) => t.id === teamId)?.name ?? "This sub-team";

  const toggle = (memberId: string) =>
    onChange(chosen.has(memberId) ? value.filter((v) => v !== memberId) : [...value, memberId]);

  return (
    <div role="group" aria-labelledby={`${id}-label`} className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span id={`${id}-label`} className="block text-xs font-medium text-ink-2">
          Assignees
        </span>
        <span className="text-[11px] text-ink-3 tabular-nums">
          {value.length === 0 ? "Nobody yet" : `${value.length} assigned`}
        </span>
      </div>

      {own.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {own.map((member) => (
            <PersonChip
              key={member.id}
              name={member.name}
              on={chosen.has(member.id)}
              onClick={() => toggle(member.id)}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-3">{teamName} has nobody listed yet.</p>
      )}

      {chosenElsewhere.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chosenElsewhere.map((member) => (
            <PersonChip
              key={member.id}
              name={member.name}
              team={teams.find((t) => t.id === member.teamId)?.name}
              on
              onClick={() => toggle(member.id)}
            />
          ))}
        </div>
      ) : null}

      {others.length > 0 ? (
        <select
          id={id}
          value=""
          onChange={(e) => {
            if (e.target.value && !chosen.has(e.target.value)) onChange([...value, e.target.value]);
          }}
          aria-label="Add someone from another sub-team"
          className="w-full min-w-0 rounded-md border border-dashed border-line bg-transparent px-2.5 py-1.5 text-xs text-ink-3 focus:border-accent focus:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <option value="">+ Add someone from another sub-team…</option>
          <MemberOptions members={others.filter((m) => !chosen.has(m.id))} teams={teams} />
        </select>
      ) : null}
    </div>
  );
}

function PersonChip({
  name,
  team,
  on,
  onClick,
}: {
  name: string;
  team?: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={on ? `Unassign ${name}` : `Assign ${name}`}
      className={clsx(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        on
          ? "border-accent/60 bg-accent/15 text-ink"
          : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full ring-1",
          on ? "bg-accent ring-accent" : "ring-line",
        )}
      >
        {on ? (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-canvas" fill="currentColor">
            <path d="M10 3 4.5 8.5 2 6l1-1 1.5 1.5L9 2l1 1Z" />
          </svg>
        ) : null}
      </span>
      {name}
      {team ? <span className="text-ink-3">· {team}</span> : null}
    </button>
  );
}

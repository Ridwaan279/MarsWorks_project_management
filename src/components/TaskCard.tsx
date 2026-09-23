"use client";

import clsx from "clsx";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { MemberView, TaskView, TeamView } from "@/lib/project";
import type { ScheduledTask } from "@/lib/schedule";
import { Avatar, ProgressBar, TeamDot } from "./ui";

export interface TaskCardProps {
  task: TaskView;
  team: TeamView;
  assignee: MemberView | null;
  scheduled: ScheduledTask | undefined;
  onOpen: (taskId: string) => void;
  onToggleFlag?: (taskId: string, flagged: boolean) => void;
  /** Opens the move-to sheet. Phone only; a mouse drags instead. */
  onMove?: (taskId: string) => void;
  /** Marks one card as the anchor for the onboarding tour. */
  tourAnchor?: boolean;
}

/**
 * Dress a card in its sub-team's colour so the board reads as six streams at
 * a glance rather than one undifferentiated wall: a solid rail down the left
 * edge, an outline carrying the same hue, and a faint wash of it behind.
 *
 * The outline is mixed with the neutral border rather than used neat. Six
 * saturated rectangles side by side fight each other and drown the schedule
 * warnings, which matter more than whose card it is; mixed, each team is
 * still told apart at a glance but red still means late.
 *
 * Schedule state rides on the ring rather than the border, because the border
 * is spoken for. Both live in one box-shadow: an inline boxShadow replaces
 * Tailwind's ring utilities wholesale, so they cannot be left to a class.
 */
function cardStyle(
  colour: string,
  state: "late" | "tight" | null,
): React.CSSProperties {
  const rail = `inset 3px 0 0 0 ${colour}`;
  const ring =
    state === "late"
      ? "0 0 0 1px color-mix(in srgb, var(--color-danger) 55%, transparent)"
      : state === "tight"
        ? "0 0 0 1px color-mix(in srgb, var(--color-warning) 45%, transparent)"
        : null;
  return {
    backgroundColor: `color-mix(in srgb, ${colour} 7%, var(--color-card))`,
    borderColor: `color-mix(in srgb, ${colour} 70%, var(--color-border))`,
    boxShadow: ring ? `${rail}, ${ring}` : rail,
  };
}

/** The visual card. Shared by the sortable card and the drag overlay. */
export function TaskCardBody({
  task,
  team,
  assignee,
  scheduled,
  dragging,
  onToggleFlag,
  onMove,
}: Omit<TaskCardProps, "onOpen"> & { dragging?: boolean }) {
  const late = scheduled ? scheduled.slackDays < 0 : false;
  const tight = scheduled ? scheduled.slackDays >= 0 && scheduled.slackDays <= 2 : false;

  return (
    <div
      style={
        task.flagged
          ? { boxShadow: `inset 3px 0 0 0 ${team.colour}` }
          : cardStyle(team.colour, late ? "late" : tight ? "tight" : null)
      }
      className={clsx(
        "space-y-2.5 rounded-lg border p-3 pl-3.5 text-left transition-[transform,box-shadow] duration-200 group-hover/card:-translate-y-px",
        // A flagged card keeps the red outline: "someone raised this by hand"
        // outranks whose card it is. The team rail above still identifies it.
        task.flagged && "border-danger bg-danger/10 ring-1 ring-danger/40",
        dragging && "card-overlay",
      )}
    >
      <div className="flex items-start gap-2">
        <TeamDot colour={team.colour} className="mt-1.5" />
        <p className="min-w-0 flex-1 text-sm leading-snug">{task.title}</p>
        {/* Rendered as a real button only on the board; the drag overlay gets
            a plain icon, because a button inside the overlay cannot be used. */}
        {onMove ? (
          <button
            type="button"
            aria-label={`Move ${task.key} to another column`}
            title="Move to another column"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onMove(task.id);
            }}
            className="-m-1 shrink-0 rounded p-1.5 text-ink-3 transition-colors hover:text-ink-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:hidden"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
              <path d="M9.3 2.3a1 1 0 0 1 1.4 0l3 3a1 1 0 0 1 0 1.4l-3 3a1 1 0 0 1-1.4-1.4L10.6 7H3a1 1 0 0 1 0-2h7.6L9.3 3.7a1 1 0 0 1 0-1.4Z" />
            </svg>
          </button>
        ) : null}
        {onToggleFlag ? (
          <button
            type="button"
            aria-pressed={task.flagged}
            aria-label={task.flagged ? `Remove flag from ${task.key}` : `Flag ${task.key}`}
            title={task.flagged ? "Flagged — click to clear" : "Flag for attention"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              // Without this the board treats the click as opening the card.
              e.stopPropagation();
              e.preventDefault();
              onToggleFlag(task.id, !task.flagged);
            }}
            className={clsx(
              "-m-1 shrink-0 rounded p-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              task.flagged
                ? "text-danger hover:text-danger/80"
                : "text-ink-3 hover:text-ink-2",
            )}
          >
            <FlagIcon filled={task.flagged} />
          </button>
        ) : (
          <span className={task.flagged ? "text-danger" : "text-ink-3"}>
            <FlagIcon filled={task.flagged} />
          </span>
        )}
      </div>

      {!task.plannedEnd && task.status !== "DONE" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            title="No planned end date, so this task is invisible to the forecast"
            className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning"
          >
            undated
          </span>
        </div>
      ) : null}

      {task.progress > 0 && task.status !== "DONE" ? (
        <ProgressBar value={task.progress} colour={team.colour} />
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-ink-3">
          <span className="font-mono" translate="no">
            {task.key}
          </span>
          {task.blockedBy.length > 0 ? (
            <span
              title={`Waiting on ${task.blockedBy.map((b) => b.key).join(", ")}`}
              className="flex items-center gap-0.5"
            >
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
                <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v4A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
              </svg>
              {task.blockedBy.length}
            </span>
          ) : null}
          {task.subtasks.length > 0 ? (
            <span
              title={`${task.subtasks.filter((st) => st.done).length} of ${task.subtasks.length} checklist items done`}
              className="tabular-nums"
            >
              {task.subtasks.filter((st) => st.done).length}/{task.subtasks.length}
            </span>
          ) : null}
          {task.links.length > 0 ? (
            <span title={`${task.links.length} link(s)`} className="flex items-center gap-0.5">
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
                <path d="M6.2 9.8a2.5 2.5 0 0 0 3.6 0l2-2a2.55 2.55 0 0 0-3.6-3.6l-.8.8 1 1 .8-.8a1.15 1.15 0 0 1 1.6 1.6l-2 2a1.15 1.15 0 0 1-1.6 0l-1 1Z" />
                <path d="M9.8 6.2a2.5 2.5 0 0 0-3.6 0l-2 2a2.55 2.55 0 0 0 3.6 3.6l.8-.8-1-1-.8.8a1.15 1.15 0 0 1-1.6-1.6l2-2a1.15 1.15 0 0 1 1.6 0l1-1Z" />
              </svg>
              {task.links.length}
            </span>
          ) : null}
          {scheduled && scheduled.isCritical && task.status !== "DONE" ? (
            <span className="rounded bg-accent/15 px-1 font-medium text-accent">
              critical
            </span>
          ) : null}
        </div>
        {assignee ? (
          <Avatar name={assignee.name} />
        ) : (
          <span className="text-[11px] text-ink-3">Unassigned</span>
        )}
      </div>
    </div>
  );
}

function FlagIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
      aria-hidden
    >
      <path d="M3.75 2v12M3.75 3h7.7a.6.6 0 0 1 .47.97L10.4 6.2a.5.5 0 0 0 0 .6l1.52 2.23a.6.6 0 0 1-.47.97h-7.7" />
    </svg>
  );
}

export function SortableTaskCard(props: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.task.id });

  /*
   * The card is a div carrying role="button", not a real <button>. It has to
   * contain the flag button, and a button inside a button is invalid HTML:
   * the parser rewrites the DOM, which breaks hydration. Keyboard support is
   * supplied explicitly so the card is still operable without a pointer.
   */
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={clsx("touch-none", isDragging && "card-dragging")}
    >
      <div
        // dnd-kit's attributes already supply role="button" and tabIndex.
        {...attributes}
        {...listeners}
        onClick={() => props.onOpen(props.task.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            props.onOpen(props.task.id);
          }
        }}
        aria-label={`${props.task.key}: ${props.task.title}`}
        data-tour={props.tourAnchor ? "card" : undefined}
        className="group/card block w-full cursor-grab touch-none rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
      >
        <TaskCardBody {...props} />
      </div>
    </li>
  );
}

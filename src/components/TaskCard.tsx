"use client";

import clsx from "clsx";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { STAGE_SHORT } from "@/lib/domain";
import type { MemberView, TaskView, TeamView } from "@/lib/project";
import type { ScheduledTask } from "@/lib/schedule";
import { Avatar, PriorityFlag, ProgressBar, TeamDot } from "./ui";

export interface TaskCardProps {
  task: TaskView;
  team: TeamView;
  assignee: MemberView | null;
  scheduled: ScheduledTask | undefined;
  onOpen: (taskId: string) => void;
}

/** The visual card. Shared by the sortable card and the drag overlay. */
export function TaskCardBody({
  task,
  team,
  assignee,
  scheduled,
  dragging,
}: Omit<TaskCardProps, "onOpen"> & { dragging?: boolean }) {
  const late = scheduled ? scheduled.slackDays < 0 : false;
  const tight = scheduled ? scheduled.slackDays >= 0 && scheduled.slackDays <= 2 : false;

  return (
    <article
      className={clsx(
        "space-y-2.5 rounded-lg border bg-surface-2 p-3 text-left",
        late ? "border-late/40" : tight ? "border-warn/30" : "border-edge",
        dragging && "card-overlay",
      )}
    >
      <div className="flex items-start gap-2">
        <TeamDot colour={team.colour} className="mt-1.5" />
        <p className="min-w-0 flex-1 text-sm leading-snug">{task.title}</p>
        <PriorityFlag priority={task.priority} />
      </div>

      {task.stage || !task.plannedEnd ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {task.stage ? (
            <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-muted">
              {STAGE_SHORT[task.stage]}
            </span>
          ) : null}
          {!task.plannedEnd && task.status !== "DONE" ? (
            <span
              title="No planned end date, so this task is invisible to the forecast"
              className="rounded bg-warn/15 px-1.5 py-0.5 text-[10px] text-warn"
            >
              undated
            </span>
          ) : null}
        </div>
      ) : null}

      {task.progress > 0 && task.status !== "DONE" ? (
        <ProgressBar value={task.progress} colour={team.colour} />
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-ink-faint">
          <span className="font-mono">{task.key}</span>
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
            <span className="rounded bg-mars/15 px-1 font-medium text-mars-soft">
              critical
            </span>
          ) : null}
        </div>
        {assignee ? (
          <Avatar name={assignee.name} />
        ) : (
          <span className="text-[11px] text-ink-faint">Unassigned</span>
        )}
      </div>
    </article>
  );
}

export function SortableTaskCard(props: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.task.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={clsx("touch-none", isDragging && "card-dragging")}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={() => props.onOpen(props.task.id)}
        className="block w-full cursor-grab rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-info active:cursor-grabbing"
      >
        <TaskCardBody {...props} />
      </button>
    </li>
  );
}

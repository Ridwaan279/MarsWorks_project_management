"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { format } from "date-fns";
import { addDays, daysBetween, startOfDay, STATUS_LABEL } from "@/lib/domain";
import type {
  MemberView,
  MilestoneView,
  TaskView,
  TeamView,
  WorkstreamView,
} from "@/lib/project";
import type { ScheduledTask } from "@/lib/schedule";
import { Avatar, TeamDot, formatDays } from "./ui";

interface TimelineProps {
  tasks: TaskView[];
  teams: TeamView[];
  members: MemberView[];
  milestones: MilestoneView[];
  workstreams: WorkstreamView[];
  scheduled: Record<string, ScheduledTask>;
  asOf: string;
}

const ZOOM = { compact: 5, normal: 9, wide: 16 } as const;
type Zoom = keyof typeof ZOOM;

const ROW_HEIGHT = 30;
const GROUP_HEIGHT = 24;

export function Timeline({
  tasks,
  teams,
  members,
  milestones,
  workstreams,
  scheduled,
  asOf,
}: TimelineProps) {
  const [zoom, setZoom] = useState<Zoom>("normal");
  const [hideDone, setHideDone] = useState(false);
  const dayWidth = ZOOM[zoom];

  const today = startOfDay(new Date(asOf));
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const visible = useMemo(
    () => (hideDone ? tasks.filter((t) => t.status !== "DONE") : tasks),
    [tasks, hideDone],
  );

  // The chart spans from a few days before today to a week past whichever is
  // later: the last forecast finish or the final milestone.
  const { start, totalDays } = useMemo(() => {
    const finishes = visible
      .map((t) => scheduled[t.id]?.earliestFinish)
      .filter(Boolean)
      .map((d) => new Date(d as unknown as string));
    const milestoneDates = milestones.map((m) => new Date(m.targetDate));
    const last = [...finishes, ...milestoneDates, today].reduce(
      (latest, d) => (d > latest ? d : latest),
      today,
    );
    const chartStart = addDays(today, -3);
    return { start: chartStart, totalDays: daysBetween(chartStart, last) + 7 };
  }, [visible, scheduled, milestones, today]);

  const chartWidth = totalDays * dayWidth;

  /** Week gridlines, labelled on the Monday. */
  const weekMarks = useMemo(() => {
    const marks: { offset: number; date: Date }[] = [];
    for (let i = 0; i < totalDays; i += 1) {
      const date = addDays(start, i);
      if (date.getDay() === 1) marks.push({ offset: i, date });
    }
    return marks;
  }, [start, totalDays]);

  /**
   * Team -> workstream -> tasks. The workstream layer is Mechanical's WBS
   * grouping; teams that do not use one get a single unnamed group so the
   * shape stays uniform.
   */
  const grouped = useMemo(() => {
    const byStart = (a: TaskView, b: TaskView) => {
      const sa = scheduled[a.id]?.earliestStart;
      const sb = scheduled[b.id]?.earliestStart;
      return (
        new Date(sa as unknown as string).getTime() -
        new Date(sb as unknown as string).getTime()
      );
    };
    return teams
      .map((team) => {
        const teamTasks = visible.filter((t) => t.teamId === team.id);
        const teamStreams = workstreams
          .filter((w) => w.teamId === team.id)
          .sort((a, b) => a.position - b.position);

        const groups = teamStreams
          .map((ws) => ({
            id: ws.id,
            label: ws.code ? `${ws.code}  ${ws.name}` : ws.name,
            tasks: teamTasks.filter((t) => t.workstreamId === ws.id).sort(byStart),
          }))
          .filter((g) => g.tasks.length > 0);

        const ungrouped = teamTasks
          .filter((t) => !t.workstreamId || !teamStreams.some((w) => w.id === t.workstreamId))
          .sort(byStart);
        if (ungrouped.length > 0) {
          groups.push({ id: `${team.id}-none`, label: "", tasks: ungrouped });
        }

        return { team, groups, count: teamTasks.length };
      })
      .filter((g) => g.count > 0);
  }, [teams, visible, workstreams, scheduled]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex flex-wrap items-center gap-4 border-b border-edge px-4 py-3 sm:px-6">
        <div className="flex items-center gap-1 rounded-md border border-edge p-0.5">
          {(Object.keys(ZOOM) as Zoom[]).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setZoom(level)}
              aria-pressed={zoom === level}
              className={clsx(
                "rounded px-2 py-1 text-xs capitalize transition-colors",
                zoom === level
                  ? "bg-surface-2 text-ink"
                  : "text-ink-faint hover:text-ink-muted",
              )}
            >
              {level}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={hideDone}
            onChange={(e) => setHideDone(e.target.checked)}
            className="accent-[var(--color-mars)]"
          />
          Hide completed
        </label>

        <div className="ml-auto flex items-center gap-4 text-xs text-ink-faint">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-mars" aria-hidden /> critical path
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3.5 w-px bg-info" aria-hidden /> today
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3.5 w-px bg-warn" aria-hidden /> milestone
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-60 shrink-0 overflow-y-auto border-r border-edge">
          <div className="sticky top-0 z-10 h-9 border-b border-edge bg-ground px-3 text-xs leading-9 font-semibold text-ink-muted">
            Sub-team / task
          </div>
          {grouped.map(({ team, groups, count }) => (
            <div key={team.id}>
              <div className="flex h-8 items-center gap-2 bg-surface/70 px-3">
                <TeamDot colour={team.colour} />
                <span className="truncate text-xs font-semibold">{team.name}</span>
                <span className="ml-auto text-[10px] tabular-nums text-ink-faint">
                  {count}
                </span>
              </div>
              {groups.map((group) => (
                <div key={group.id}>
                  {group.label ? (
                    <div
                      style={{ height: GROUP_HEIGHT }}
                      className="flex items-center px-3 pl-5 text-[11px] font-medium text-ink-muted"
                    >
                      <span className="truncate">{group.label}</span>
                    </div>
                  ) : null}
                  {group.tasks.map((task) => (
                    <Link
                      key={task.id}
                      href={`/board?task=${task.id}`}
                      style={{ height: ROW_HEIGHT }}
                      className="flex items-center gap-2 px-3 pl-6 text-xs transition-colors hover:bg-surface-2"
                    >
                      <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                        {task.key}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ink-muted">
                        {task.title}
                      </span>
                      {task.assigneeId ? (
                        <Avatar name={memberById.get(task.assigneeId)?.name ?? "?"} />
                      ) : null}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          <div style={{ width: chartWidth, minWidth: "100%" }} className="relative">
            <div className="sticky top-0 z-10 flex h-9 border-b border-edge bg-ground">
              {weekMarks.map((mark) => (
                <span
                  key={mark.offset}
                  style={{ left: mark.offset * dayWidth }}
                  className="absolute top-0 pl-1.5 text-[10px] leading-9 text-ink-faint whitespace-nowrap"
                >
                  {format(mark.date, zoom === "compact" ? "d/M" : "d MMM")}
                </span>
              ))}
            </div>

            <div className="relative">
              {weekMarks.map((mark) => (
                <span
                  key={mark.offset}
                  aria-hidden
                  style={{ left: mark.offset * dayWidth }}
                  className="absolute inset-y-0 w-px bg-edge-soft"
                />
              ))}

              <span
                aria-hidden
                style={{ left: daysBetween(start, today) * dayWidth }}
                className="absolute inset-y-0 z-20 w-px bg-info"
              />

              {milestones.map((milestone) => {
                const offset = daysBetween(start, new Date(milestone.targetDate));
                return (
                  <span
                    key={milestone.id}
                    title={`${milestone.name} — ${format(new Date(milestone.targetDate), "d MMM")}`}
                    style={{ left: offset * dayWidth }}
                    className="absolute inset-y-0 z-20 w-px bg-warn/70"
                  >
                    <span className="absolute -top-0 left-1 rounded bg-warn/15 px-1 text-[9px] whitespace-nowrap text-warn">
                      {milestone.name}
                    </span>
                  </span>
                );
              })}

              {grouped.map(({ team, groups }) => (
                <div key={team.id}>
                  <div className="h-8 bg-surface/70" />
                  {groups.map((group) => (
                    <div key={group.id}>
                      {group.label ? <div style={{ height: GROUP_HEIGHT }} /> : null}
                      {group.tasks.map((task) => {
                    const sched = scheduled[task.id];
                    if (!sched) return <div key={task.id} style={{ height: ROW_HEIGHT }} />;
                    const barStart = daysBetween(start, new Date(sched.earliestStart as unknown as string));
                    const barEnd = daysBetween(start, new Date(sched.earliestFinish as unknown as string));
                    const width = Math.max(barEnd - barStart, 0.5) * dayWidth;
                    const done = task.status === "DONE";
                    return (
                      <div
                        key={task.id}
                        style={{ height: ROW_HEIGHT }}
                        className="relative flex items-center"
                      >
                        <Link
                          href={`/impact?task=${task.id}`}
                          title={`${task.key}: ${task.title}\n${format(new Date(sched.earliestStart as unknown as string), "d MMM")} – ${format(new Date(sched.earliestFinish as unknown as string), "d MMM")}\n${formatDays(-sched.slackDays)}`}
                          style={{ left: barStart * dayWidth, width }}
                          className={clsx(
                            "absolute flex h-4 items-center overflow-hidden rounded-sm ring-1 transition-all hover:h-5 hover:ring-2",
                            done
                              ? "opacity-45 ring-transparent"
                              : sched.isCritical
                                ? "ring-mars"
                                : sched.slackDays < 0
                                  ? "ring-late"
                                  : "ring-transparent",
                          )}
                        >
                          <span
                            aria-hidden
                            className="absolute inset-0 opacity-35"
                            style={{ backgroundColor: team.colour }}
                          />
                          <span
                            aria-hidden
                            className="absolute inset-y-0 left-0"
                            style={{
                              width: `${done ? 100 : task.progress}%`,
                              backgroundColor: team.colour,
                            }}
                          />
                          <span className="sr-only">
                            {task.key} {task.title}, {STATUS_LABEL[task.status]}
                          </span>
                        </Link>
                      </div>
                    );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

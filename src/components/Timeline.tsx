"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { format } from "date-fns";
import {
  addDays,
  daysBetween,
  SEASON_END,
  startOfDay,
  STATUS_LABEL,
} from "@/lib/domain";
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

/**
 * How far back and forward the chart reaches.
 *
 * "Current" is the default because most questions are about the weeks either
 * side of today, but it previously started three days ago, which cut off
 * everything already under way. "Everything" spans the whole plan, earliest
 * planned start to latest finish, so past work is visible.
 */
const RANGES = {
  current: { label: "Current", back: 30, forward: 90 },
  upcoming: { label: "Upcoming", back: 0, forward: null },
  everything: { label: "Whole season", back: null, forward: null },
} as const;
type RangeKey = keyof typeof RANGES;

const ROW_HEIGHT = 30;
const GROUP_HEIGHT = 24;
const TEAM_HEIGHT = 32;
const HEADER_HEIGHT = 44;
/**
 * Width of the frozen task-name column.
 *
 * 240px of a 390px phone leaves about 150px of actual chart, which is not a
 * timeline. The narrow value trades full task names (they truncate) for a
 * chart wide enough to read, which is the reason to open this page at all.
 */
const RAIL_WIDE = 240;
const RAIL_NARROW = 124;

/**
 * True on phone-width viewports.
 *
 * Starts false so the server and the first client render agree; the effect
 * corrects it after mount. Matching on the client during render instead would
 * be a hydration mismatch.
 */
function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return narrow;
}

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
  const [teamFilter, setTeamFilter] = useState<string | "ALL">("ALL");
  const [range, setRange] = useState<RangeKey>("current");
  const dayWidth = ZOOM[zoom];
  const narrow = useNarrow();
  const RAIL = narrow ? RAIL_NARROW : RAIL_WIDE;

  const today = startOfDay(new Date(asOf));
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const visible = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (!hideDone || t.status !== "DONE") &&
          (teamFilter === "ALL" || t.teamId === teamFilter),
      ),
    [tasks, hideDone, teamFilter],
  );

  /**
   * The window the chart covers. The natural extent comes from the work
   * itself -- earliest planned start through latest forecast finish, plus the
   * milestones -- and the chosen range then clamps it around today.
   */
  const { start, totalDays } = useMemo(() => {
    const dates: Date[] = [today];
    for (const task of visible) {
      if (task.plannedStart) dates.push(new Date(task.plannedStart));
      if (task.plannedEnd) dates.push(new Date(task.plannedEnd));
      const sched = scheduled[task.id];
      if (sched) {
        dates.push(new Date(sched.earliestStart as unknown as string));
        dates.push(new Date(sched.earliestFinish as unknown as string));
      }
    }
    for (const m of milestones) dates.push(new Date(m.targetDate));
    // The season runs to the September handover, so the chart does too.
    if (range === "everything") dates.push(SEASON_END);

    let earliest = dates.reduce((a, d) => (d < a ? d : a), dates[0]);
    let latest = dates.reduce((a, d) => (d > a ? d : a), dates[0]);

    const { back, forward } = RANGES[range];
    if (back !== null) {
      const floor = addDays(today, -back);
      if (earliest < floor) earliest = floor;
    }
    if (forward !== null) {
      const ceiling = addDays(today, forward);
      if (latest > ceiling) latest = ceiling;
    }
    // Never start after today, or the "today" marker falls off the chart.
    if (earliest > today) earliest = today;

    const chartStart = addDays(startOfDay(earliest), -3);
    return {
      start: chartStart,
      totalDays: Math.max(daysBetween(chartStart, startOfDay(latest)) + 7, 14),
    };
  }, [visible, scheduled, milestones, today, range]);

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

  /** Team -> workstream -> tasks, keeping the shape uniform for teams with no
   *  workstreams so rows line up between the rail and the chart. */
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
          .map((ws) => {
            const tasks = teamTasks
              .filter((t) => t.workstreamId === ws.id)
              .sort(byStart);
            return {
              id: ws.id,
              label: ws.code ? `${ws.code}  ${ws.name}` : ws.name,
              // Workstream bands carry their sub-team's colour, the same
              // identity the board and the overview use.
              colour: team.colour,
              tasks,
            };
          })
          .filter((g) => g.tasks.length > 0);

        const ungrouped = teamTasks
          .filter(
            (t) => !t.workstreamId || !teamStreams.some((w) => w.id === t.workstreamId),
          )
          .sort(byStart);
        if (ungrouped.length > 0) {
          groups.push({
            id: `${team.id}-none`,
            label: "",
            colour: team.colour,
            tasks: ungrouped,
          });
        }

        return { team, groups, count: teamTasks.length };
      })
      .filter((g) => g.count > 0);
  }, [teams, visible, workstreams, scheduled]);

  /**
   * Milestones inside the visible range, each with the pixel room available
   * before the next one. Labels are truncated to that width so two milestones
   * a few days apart do not print over each other.
   */
  const milestonesInView = useMemo(() => {
    const inRange = milestones
      .map((milestone) => ({
        milestone,
        offset: daysBetween(start, new Date(milestone.targetDate)),
      }))
      .filter((m) => m.offset >= 0 && m.offset <= totalDays)
      .sort((a, b) => a.offset - b.offset);

    return inRange.map((m, i) => {
      const next = inRange[i + 1];
      const gap = next ? (next.offset - m.offset) * dayWidth - 6 : chartWidth - m.offset * dayWidth;
      return { ...m, room: gap };
    });
  }, [milestones, start, totalDays, dayWidth, chartWidth]);

  const todayOffset = daysBetween(start, today) * dayWidth;

  /*
   * Open on today rather than on the left edge of the range.
   *
   * The range starts weeks before now so that work already under way has its
   * run-up visible, but that means the first screenful is empty history --
   * and on a phone, where only about 250px of chart fits, the bars can be
   * entirely off-screen with nothing to suggest scrolling right. A week of
   * lead-in keeps the immediate past in view without burying the present.
   */
  const chartRef = useRef<HTMLDivElement>(null);
  const scrolledRef = useRef(false);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || scrolledRef.current) return;
    const lead = 7 * dayWidth;
    chart.scrollLeft = Math.max(0, todayOffset - lead);
    scrolledRef.current = true;
  }, [todayOffset, dayWidth]);

  // Range and zoom changes rebuild the axis, so re-anchor on the next paint.
  useEffect(() => {
    scrolledRef.current = false;
  }, [range, zoom]);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
        <label data-tour="filters" className="flex items-center gap-2 text-xs text-ink-2">
          Sub-team
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="rounded-md border border-line bg-panel px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="ALL">All teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <label data-tour="range" className="flex items-center gap-2 text-xs text-ink-2">
          Range
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as RangeKey)}
            className="rounded-md border border-line bg-panel px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {(Object.keys(RANGES) as RangeKey[]).map((key) => (
              <option key={key} value={key}>
                {RANGES[key].label}
              </option>
            ))}
          </select>
        </label>

        <div
          role="group"
          aria-label="Zoom"
          className="flex items-center gap-0.5 rounded-md border border-line p-0.5"
        >
          {(Object.keys(ZOOM) as Zoom[]).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setZoom(level)}
              aria-pressed={zoom === level}
              className={clsx(
                "rounded px-2.5 py-1.5 text-xs capitalize transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                zoom === level
                  ? "bg-elevated text-ink"
                  : "text-ink-3 hover:text-ink-2",
              )}
            >
              {level}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input
            type="checkbox"
            checked={hideDone}
            onChange={(e) => setHideDone(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
          />
          Hide completed
        </label>

        <span className="text-xs text-ink-3 tabular-nums" data-testid="timeline-count">
          {visible.length} shown
        </span>

        <div className="ml-auto flex items-center gap-4 text-xs text-ink-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-accent" aria-hidden /> critical path
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3.5 w-0.5 bg-today" aria-hidden /> today
          </span>
          <span className="flex items-center gap-1.5">
            {/* Dashed, matching the line on the chart: colour alone is a weak
                signal for a 1px rule, and it has to survive colour-blindness. */}
            <span
              aria-hidden
              className="h-3.5 w-0.5 bg-[length:2px_5px] bg-repeat-y"
              style={{
                backgroundImage:
                  "linear-gradient(var(--color-milestone) 60%, transparent 60%)",
              }}
            />{" "}
            milestone
          </span>
        </div>
      </div>

      {grouped.length === 0 ? (
        <p className="px-6 py-10 text-sm text-ink-3">
          No tasks match these filters.
        </p>
      ) : (
        /*
         * One scroll container for both axes. The task names are ordinary
         * cells pinned with `position: sticky; left: 0`, so they scroll
         * vertically with their own bars instead of being a separate pane
         * that has to be kept in step.
         */
        <div
          ref={chartRef}
          data-tour="chart"
          className="overscroll-none-safe relative flex-1 overflow-auto"
        >
          <div
            className="relative"
            style={{ width: RAIL + chartWidth, minWidth: "100%" }}
          >
            <div
              className="sticky top-0 z-30 flex border-b border-line bg-canvas"
              style={{ height: HEADER_HEIGHT }}
            >
              <div
                className="sticky left-0 z-10 flex shrink-0 items-center border-r border-line bg-canvas px-3 text-xs font-semibold text-ink-2"
                style={{ width: RAIL }}
              >
                Sub-team / task
              </div>
              <div className="relative shrink-0" style={{ width: chartWidth }}>
                {weekMarks.map((mark) => (
                  <span
                    key={mark.offset}
                    style={{ left: mark.offset * dayWidth }}
                    className="absolute top-1 pl-1.5 text-[10px] whitespace-nowrap text-ink-3 tabular-nums"
                  >
                    {format(mark.date, zoom === "compact" ? "d/M" : "d MMM")}
                  </span>
                ))}
                {/* The chip is tinted from the milestone hue so that it and
                    the rule below it plainly belong to the same marker. */}
                {milestonesInView.map(({ milestone, offset, room }) => (
                  <span
                    key={milestone.id}
                    title={`${milestone.name} — ${format(new Date(milestone.targetDate), "d MMM yyyy")}`}
                    style={{
                      left: offset * dayWidth + 2,
                      maxWidth: Math.max(room, 18),
                      backgroundColor:
                        "color-mix(in srgb, var(--color-milestone) 18%, var(--color-bg))",
                    }}
                    className="absolute bottom-1 truncate rounded px-1 text-[9px] text-milestone"
                  >
                    {milestone.name}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative">
              {/* Gridlines, today and milestones run the full height of the
                  body, behind the rows, offset past the frozen rail. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 z-0"
                style={{ left: RAIL, width: chartWidth }}
              >
                {weekMarks.map((mark) => (
                  <span
                    key={mark.offset}
                    style={{ left: mark.offset * dayWidth }}
                    className="absolute inset-y-0 w-px bg-line"
                  />
                ))}
                {milestonesInView.map(({ milestone, offset }) => (
                  <span
                    key={milestone.id}
                    style={{
                      left: offset * dayWidth,
                      backgroundImage:
                        "linear-gradient(var(--color-milestone) 60%, transparent 60%)",
                      backgroundSize: "1px 6px",
                    }}
                    className="absolute inset-y-0 w-px"
                  />
                ))}
                {/* Today reads as the one line you look for first, so it is
                    solid, full strength and a shade wider than a gridline. */}
                <span
                  style={{ left: todayOffset }}
                  className="absolute inset-y-0 w-0.5 bg-today"
                />
              </div>

              {grouped.map(({ team, groups, count }) => (
                <div key={team.id} className="relative z-10">
                  <Row height={TEAM_HEIGHT} chartWidth={chartWidth} railWidth={RAIL} tone="team">
                    <span className="flex w-full items-center gap-2">
                      <TeamDot colour={team.colour} />
                      <span className="truncate text-xs font-semibold">{team.name}</span>
                      <span className="ml-auto text-[10px] text-ink-3 tabular-nums">
                        {count}
                      </span>
                    </span>
                  </Row>

                  {groups.map((group) => (
                    <div key={group.id}>
                      {group.label ? (
                        <Row
                          height={GROUP_HEIGHT}
                          chartWidth={chartWidth}
                          railWidth={RAIL}
                          tone="group"
                          accent={group.colour}
                        >
                          <span className="flex w-full min-w-0 items-center gap-2 pl-3">
                            <span
                              aria-hidden
                              className="h-2.5 w-0.5 shrink-0 rounded-full"
                              style={{ backgroundColor: group.colour }}
                            />
                            <span className="truncate text-[11px] font-medium text-ink-2">
                              {group.label}
                            </span>
                          </span>
                        </Row>
                      ) : null}

                      {group.tasks.map((task) => {
                        const sched = scheduled[task.id];
                        const barStart = sched
                          ? daysBetween(start, new Date(sched.earliestStart as unknown as string))
                          : 0;
                        const barEnd = sched
                          ? daysBetween(start, new Date(sched.earliestFinish as unknown as string))
                          : 0;
                        const width = Math.max(barEnd - barStart, 0.5) * dayWidth;
                        const done = task.status === "DONE";
                        return (
                          <Row
                            key={task.id}
                            height={ROW_HEIGHT}
                            chartWidth={chartWidth}
                            railWidth={RAIL}
                            tone="task"
                            rail={
                              <Link
                                href={`/board?task=${task.id}`}
                                className="flex h-full w-full items-center gap-2 pl-3 text-xs transition-colors hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                              >
                                <span className="shrink-0 font-mono text-[10px] text-ink-3" translate="no">
                                  {task.key}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-ink-2">
                                  {task.title}
                                </span>
                                {task.assigneeId ? (
                                  <Avatar
                                    name={memberById.get(task.assigneeId)?.name ?? "?"}
                                    className="mr-2"
                                  />
                                ) : null}
                              </Link>
                            }
                          >
                            {sched ? (
                              <Link
                                href={`/impact?task=${task.id}`}
                                title={`${task.key}: ${task.title}\n${format(new Date(sched.earliestStart as unknown as string), "d MMM")} – ${format(new Date(sched.earliestFinish as unknown as string), "d MMM")}\n${formatDays(-sched.slackDays)}`}
                                style={{ left: barStart * dayWidth, width }}
                                className={clsx(
                                  "absolute top-1/2 flex h-4 -translate-y-1/2 items-center overflow-hidden rounded-sm ring-1 transition-[height,box-shadow] hover:h-5 hover:ring-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                                  done
                                    ? "opacity-50 ring-transparent"
                                    : sched.isCritical
                                      ? "ring-accent"
                                      : sched.slackDays < 0
                                        ? "ring-danger"
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
                            ) : null}
                          </Row>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One timeline row: a frozen label cell plus the chart area beside it. Both
 * halves live in the same flex row, which is what keeps the names aligned
 * with their bars no matter how the container is scrolled.
 */
function Row({
  height,
  chartWidth,
  railWidth,
  tone,
  accent,
  rail,
  children,
}: {
  height: number;
  chartWidth: number;
  railWidth: number;
  tone: "team" | "group" | "task";
  accent?: string;
  rail?: React.ReactNode;
  children?: React.ReactNode;
}) {
  // The label cell must be opaque: it is pinned over the gridlines behind it.
  const background = tone === "team" ? "bg-elevated" : "bg-canvas";
  const tint =
    tone === "group" && accent
      ? { backgroundColor: `color-mix(in srgb, ${accent} 10%, var(--color-bg))` }
      : undefined;
  return (
    <div className={clsx("flex", tone === "team" && "border-t border-line")} style={{ height }}>
      <div
        className={clsx(
          "sticky left-0 z-20 flex shrink-0 items-center border-r border-line",
          rail ? "" : "px-3",
          background,
        )}
        style={{ width: railWidth, ...tint }}
      >
        {rail ?? children}
      </div>
      <div
        className={clsx("relative shrink-0", tone === "team" && "bg-elevated/60")}
        style={{ width: chartWidth, ...tint }}
      >
        {rail ? children : null}
      </div>
    </div>
  );
}

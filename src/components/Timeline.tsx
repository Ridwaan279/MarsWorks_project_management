"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { TeamFilter } from "./TeamFilter";
import { checklistProgress } from "@/lib/progress";
import { academicBands, academicWeeks, type PeriodKind } from "@/lib/academic";
import { format } from "date-fns";
import {
  addDays,
  daysBetween,
  SEASON_END,
  SEASON_START,
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
import { AvatarStack, TeamDot, formatDays } from "./ui";

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

const ROW_HEIGHT = 32;
const GROUP_HEIGHT = 26;
const TEAM_HEIGHT = 36;
/** The header's three bands: university periods, weeks, milestones. */
const TERM_ROW = 20;
const WEEK_ROW = 30;
const MILESTONE_ROW = 20;
const HEADER_HEIGHT = TERM_ROW + WEEK_ROW + MILESTONE_ROW;
/** Roughly how wide a character of a bar's 11px label is, to tell if it fits. */
const CHAR_WIDTH = 6;

/**
 * Each kind of week's colour. As in the team's own rover timeline, holidays
 * and exams stand out from teaching weeks at a glance; teaching weeks are
 * left plain and only alternate faintly, like spreadsheet columns.
 */
const PERIOD_COLOUR: Record<PeriodKind, string | null> = {
  welcome: "var(--color-information)",
  teaching: null,
  holiday: "var(--color-success)",
  exams: "var(--color-warning)",
  season: "var(--color-accent)",
};
/**
 * Blocked work is striped grey, echoing the dark "can't happen" blocks in the
 * team's sheet. Stripes rather than a flat grey, which a grey-ish sub-team
 * colour (Operations) could be mistaken for.
 */
const BLOCKED_FILL =
  "repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-text-muted) 45%, var(--color-bg)) 0 5px, color-mix(in srgb, var(--color-text-muted) 22%, var(--color-bg)) 5px 10px)";
const periodTint = (kind: PeriodKind | null, strength: number) => {
  const colour = kind ? PERIOD_COLOUR[kind] : null;
  return colour ? `color-mix(in srgb, ${colour} ${strength}%, transparent)` : undefined;
};
/** Longest a bar's label may run before it truncates. */
const LABEL_MAX = 260;
/**
 * Width of the frozen task-name column.
 *
 * 240px of a 390px phone leaves about 150px of actual chart, which is not a
 * timeline. The narrow value trades full task names (they truncate) for a
 * chart wide enough to read, which is the reason to open this page at all.
 */
const RAIL_WIDE = 320;
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
  /*
   * "normal" on a desktop, "compact" on a phone.
   *
   * At 9px a day, a 250px-wide chart shows under four weeks, so a task that
   * runs a month has no visible end and the chart reads as a wall of bars.
   * 5px a day fits about seven weeks in the same space, which is enough to
   * see where a bar stops. Still a normal state variable, so the density
   * buttons continue to override it.
   */
  const [zoom, setZoom] = useState<Zoom>("normal");
  const [hideDone, setHideDone] = useState(false);
  // Empty means every team; see TeamFilter.
  const [teamFilter, setTeamFilter] = useState<string[]>([]);
  const [range, setRange] = useState<RangeKey>("current");
  const dayWidth = ZOOM[zoom];
  const narrow = useNarrow();
  const RAIL = narrow ? RAIL_NARROW : RAIL_WIDE;

  // Applied once, when the viewport width first becomes known. Guarded so it
  // never undoes a density the reader picked themselves.
  const zoomDefaulted = useRef(false);
  useEffect(() => {
    if (zoomDefaulted.current || !narrow) return;
    zoomDefaulted.current = true;
    setZoom("compact");
  }, [narrow]);

  /*
   * The width the chart has to fill. Without it a short range left the grid
   * stopping part-way across a wide screen, with bare page to its right.
   */
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const today = startOfDay(new Date(asOf));
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const visible = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (!hideDone || t.status !== "DONE") &&
          (teamFilter.length === 0 || teamFilter.includes(t.teamId)),
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

    // The three-day lead-in keeps a bar starting on day one from being flush
    // against the axis; the season floor then wins over it, so the chart
    // opens on the season's first day and never earlier.
    let chartStart = addDays(startOfDay(earliest), -3);
    const floor = startOfDay(SEASON_START);
    if (chartStart < floor) chartStart = floor;
    // At least enough days to reach the right-hand edge of the screen.
    const toFill = Math.ceil(Math.max(0, viewportWidth - RAIL) / dayWidth);
    return {
      start: chartStart,
      totalDays: Math.max(daysBetween(chartStart, startOfDay(latest)) + 7, 14, toFill),
    };
  }, [visible, scheduled, milestones, today, range, viewportWidth, RAIL, dayWidth]);

  const chartWidth = totalDays * dayWidth;

  /** The university's weeks and periods across the chart; see lib/academic. */
  const weeks = useMemo(() => academicWeeks(start, totalDays), [start, totalDays]);
  const bands = useMemo(() => academicBands(start, totalDays), [start, totalDays]);
  /** Where a week's column starts and how wide it is, clipped to the chart. */
  const weekBox = (offset: number) => {
    const from = Math.max(offset, 0);
    return { left: from * dayWidth, width: (Math.min(offset + 7, totalDays) - from) * dayWidth };
  };

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

        // The team's whole span, drawn faintly on its header row.
        let spanStart = Infinity;
        let spanEnd = -Infinity;
        for (const task of teamTasks) {
          const sched = scheduled[task.id];
          if (!sched) continue;
          spanStart = Math.min(spanStart, new Date(sched.earliestStart as unknown as string).getTime());
          spanEnd = Math.max(spanEnd, new Date(sched.earliestFinish as unknown as string).getTime());
        }
        const span = Number.isFinite(spanStart) ? { from: new Date(spanStart), to: new Date(spanEnd) } : null;

        return { team, groups, count: teamTasks.length, span };
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
    <div ref={rootRef} className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div data-tour="filters" className="flex items-center gap-2 text-xs text-ink-2">
          <label htmlFor="timeline-team-filter">Sub-team</label>
          <TeamFilter
            id="timeline-team-filter"
            teams={teams}
            selected={teamFilter}
            onChange={setTeamFilter}
          />
        </div>

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

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-[3px] ring-1 ring-accent ring-inset" aria-hidden /> critical path
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-4 rounded-[3px]"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-danger) 30%, var(--color-bg))" }}
            />{" "}
            running late
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-4 rounded-[3px] border border-dashed border-ink-3" /> planned dates
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-4 rounded-[3px]" style={{ backgroundImage: BLOCKED_FILL }} /> blocked
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-4 rounded-[3px]" style={{ backgroundColor: periodTint("holiday", 35) }} /> holidays
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-4 rounded-[3px]" style={{ backgroundColor: periodTint("exams", 35) }} /> exams
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
                className="sticky left-0 z-10 flex shrink-0 items-end justify-between gap-2 border-r border-line bg-canvas px-3 pb-2 text-xs font-semibold text-ink-2"
                style={{ width: RAIL }}
              >
                <span>Sub-team / task</span>
                {narrow ? null : <span className="w-24 text-right">Who</span>}
              </div>
              <div className="relative shrink-0" style={{ width: chartWidth }}>
                {/* University periods. Each name sticks just past the frozen
                    column while its period is on screen. overflow: clip, not
                    hidden -- hidden would make each band its own scroll box
                    and stop the name sticking. */}
                {bands.map((band) => (
                  <div
                    key={`band-${band.offset}`}
                    className="absolute top-0 overflow-clip border-l border-line"
                    style={{
                      left: band.offset * dayWidth,
                      width: band.days * dayWidth,
                      height: TERM_ROW,
                      backgroundColor: periodTint(band.kind, 26),
                    }}
                  >
                    <span
                      className="sticky inline-block px-2 text-[11px] leading-5 font-semibold whitespace-nowrap text-ink"
                      style={{ left: RAIL }}
                    >
                      {band.name}
                    </span>
                  </div>
                ))}
                {/* One cell per week, named as the team counts them: "Wk 3",
                    "Hol 2", "Exam 1", with the Monday's date beneath. */}
                {weeks.map((week, i) => (
                  <div
                    key={`week-${week.offset}`}
                    title={`${week.long || "Week"} — week of ${format(week.monday, "d MMM yyyy")}`}
                    className={clsx(
                      "absolute overflow-hidden border-t border-l border-line/70",
                      zoom === "compact" ? "px-1" : "px-1.5",
                    )}
                    style={{
                      ...weekBox(week.offset),
                      top: TERM_ROW,
                      height: WEEK_ROW,
                      backgroundColor:
                        periodTint(week.kind, 16) ??
                        (i % 2 ? "color-mix(in srgb, var(--color-text) 3%, transparent)" : undefined),
                    }}
                  >
                    <span className="block truncate pt-0.5 text-[10px] leading-[13px] font-semibold text-ink-2">
                      {(zoom === "compact" ? week.short : week.label) || "\u00a0"}
                    </span>
                    <span className="block truncate text-[9px] leading-3 text-ink-3 tabular-nums">
                      {format(week.monday, zoom === "compact" ? "d/M" : "d MMM")}
                    </span>
                  </div>
                ))}
                <span
                  style={{ left: todayOffset, top: TERM_ROW + WEEK_ROW + 3 }}
                  className="absolute z-10 -translate-x-1/2 rounded-full bg-today px-1.5 text-[9px] leading-[14px] font-semibold text-canvas"
                >
                  Today
                </span>
                {/* The chip is tinted from the milestone hue so that it and
                    the rule below it plainly belong to the same marker. */}
                {milestonesInView.map(({ milestone, offset, room }) => (
                  <span
                    key={milestone.id}
                    title={`${milestone.name} — ${format(new Date(milestone.targetDate), "d MMM yyyy")}`}
                    style={{
                      left: offset * dayWidth - 5,
                      top: TERM_ROW + WEEK_ROW + 2,
                      maxWidth: Math.max(room, 18),
                      backgroundColor:
                        "color-mix(in srgb, var(--color-milestone) 16%, var(--color-bg))",
                    }}
                    className="absolute flex items-center gap-1 truncate rounded px-1 text-[9px] leading-4 text-milestone"
                  >
                    <span aria-hidden className="h-1.5 w-1.5 shrink-0 rotate-45 bg-milestone" />
                    <span className="truncate">{milestone.name}</span>
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
                {/* Holidays and exams tint their weeks all the way down, and
                    teaching weeks alternate faintly, like the team's sheet. */}
                {weeks.map((week, i) => {
                  const tint =
                    periodTint(week.kind, 8) ??
                    (i % 2 ? "color-mix(in srgb, var(--color-text) 2.5%, transparent)" : undefined);
                  return tint ? (
                    <span
                      key={`wk-${week.offset}`}
                      className="absolute inset-y-0"
                      style={{ ...weekBox(week.offset), backgroundColor: tint }}
                    />
                  ) : null;
                })}
                {weeks
                  .filter((week) => week.offset > 0)
                  .map((week) => (
                    <span
                      key={`wl-${week.offset}`}
                      style={{ left: week.offset * dayWidth }}
                      className="absolute inset-y-0 w-px bg-line/60"
                    />
                  ))}
                {bands
                  .filter((band) => band.offset > 0)
                  .map((band) => (
                    <span
                      key={`bl-${band.offset}`}
                      style={{ left: band.offset * dayWidth }}
                      className="absolute inset-y-0 w-px bg-line-strong"
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

              {grouped.map(({ team, groups, count, span }) => (
                <div key={team.id} className="relative z-10">
                  <Row
                    height={TEAM_HEIGHT}
                    chartWidth={chartWidth}
                    railWidth={RAIL}
                    tone="team"
                    accent={team.colour}
                    rail={
                      <span className="flex h-full w-full items-center gap-2 px-3">
                        <TeamDot colour={team.colour} />
                        <span className="truncate text-xs font-semibold text-ink">{team.name}</span>
                        <span className="ml-auto rounded-full bg-canvas/60 px-1.5 text-[10px] leading-4 text-ink-3 tabular-nums">
                          {count}
                        </span>
                      </span>
                    }
                  >
                    {span ? (
                      <span
                        aria-hidden
                        title={`${team.name}: ${format(span.from, "d MMM")} – ${format(span.to, "d MMM")}`}
                        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                        style={{
                          left: daysBetween(start, span.from) * dayWidth,
                          width: Math.max(daysBetween(span.from, span.to), 1) * dayWidth,
                          backgroundColor: `color-mix(in srgb, ${team.colour} 55%, transparent)`,
                        }}
                      />
                    ) : null}
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
                        const blocked = task.status === "BLOCKED";
                        const barLeft = barStart * dayWidth;
                        const barRight = barLeft + width;
                        // Running over, as the team's sheet puts it: forecast to
                        // finish after its own planned end, or late enough to
                        // hold up what depends on it. Whichever is the larger.
                        const lateBy =
                          sched && !done
                            ? Math.max(sched.planVarianceDays ?? 0, -sched.slackDays, 0)
                            : 0;
                        const progress = done ? 100 : (checklistProgress(task)?.percent ?? 0);
                        const who = task.assigneeIds.map((id) => memberById.get(id)?.name ?? "?");
                        const plan =
                          task.plannedStart && task.plannedEnd
                            ? {
                                left: daysBetween(start, new Date(task.plannedStart)) * dayWidth,
                                width:
                                  Math.max(daysBetween(new Date(task.plannedStart), new Date(task.plannedEnd)), 0.5) *
                                  dayWidth,
                              }
                            : null;
                        const whoText = who.length > 0 ? who.join(", ") : (task.ownerLabel ?? "");
                        const text = `${blocked ? "Blocked · " : ""}${task.title}${lateBy > 0 ? ` · ${formatDays(lateBy)}` : ""}`;
                        // Written inside the bar, as the team's sheet does, when it
                        // fits; otherwise beside it -- after the bar, unless that
                        // runs off the edge and there is more room before.
                        const inside = width >= text.length * CHAR_WIDTH + (done ? 30 : 16);
                        const roomAfter = chartWidth - barRight - 12;
                        const labelAfter = roomAfter >= 120 || barLeft - 12 < roomAfter;
                        // Late work runs red and blocked work grey, as in the
                        // sheet; otherwise a pastel of the team's colour.
                        const fill = done
                          ? `color-mix(in srgb, ${team.colour} 14%, var(--color-bg))`
                          : blocked
                            ? undefined
                            : lateBy > 0
                              ? "color-mix(in srgb, var(--color-danger) 28%, var(--color-bg))"
                              : `color-mix(in srgb, ${team.colour} 32%, var(--color-bg))`;
                        return (
                          <Row
                            key={task.id}
                            height={ROW_HEIGHT}
                            chartWidth={chartWidth}
                            railWidth={RAIL}
                            tone="task"
                            accent={team.colour}
                            rail={
                              <Link
                                href={`/board?task=${task.id}`}
                                className="flex h-full w-full items-center gap-2 pl-3 text-xs transition-colors hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                              >
                                <span className="shrink-0 font-mono text-[10px] text-ink-3" translate="no">
                                  {task.key}
                                </span>
                                <span
                                  className={clsx(
                                    "min-w-0 flex-1 truncate",
                                    done ? "text-ink-3 line-through" : "text-ink-2",
                                  )}
                                >
                                  {task.title}
                                </span>
                                {narrow ? (
                                  <AvatarStack names={who} max={2} className="mr-2" />
                                ) : (
                                  <span
                                    title={whoText || undefined}
                                    className="mr-3 w-24 shrink-0 truncate text-right text-[11px] text-ink-3"
                                  >
                                    {whoText}
                                  </span>
                                )}
                              </Link>
                            }
                          >
                            {sched ? (
                              <>
                                {/* The plan, as a dashed outline behind the bar: where
                                    the team meant to do this, against where it is now
                                    forecast. Shown only where the two differ. */}
                                {plan && (plan.left !== barLeft || plan.width !== width) ? (
                                  <span
                                    aria-hidden
                                    className="absolute top-1/2 h-[22px] -translate-y-1/2 rounded-[4px] border border-dashed"
                                    style={{
                                      left: plan.left,
                                      width: plan.width,
                                      borderColor: `color-mix(in srgb, ${team.colour} 70%, var(--color-bg))`,
                                    }}
                                  />
                                ) : null}
                                <Link
                                  href={`/impact?task=${task.id}`}
                                  title={`${task.key}: ${task.title}${whoText ? `\n${whoText}` : ""}\n${format(new Date(sched.earliestStart as unknown as string), "d MMM")} – ${format(new Date(sched.earliestFinish as unknown as string), "d MMM")}\n${formatDays(-sched.slackDays)}`}
                                  style={{
                                    left: barLeft,
                                    width,
                                    backgroundColor: fill,
                                    backgroundImage: blocked && !done ? BLOCKED_FILL : undefined,
                                    // The team's colour down the bar's leading edge,
                                    // with a hairline of it around the rest.
                                    boxShadow: done
                                      ? undefined
                                      : `inset 3px 0 0 ${team.colour}, inset 0 0 0 1px color-mix(in srgb, ${team.colour} 45%, var(--color-bg))`,
                                  }}
                                  className={clsx(
                                    "absolute top-1/2 flex h-[22px] -translate-y-1/2 items-center gap-1 overflow-hidden rounded-[4px] pr-1.5 pl-2 ring-offset-1 ring-offset-canvas transition-[filter] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                                    !done && sched.isCritical && "ring-1 ring-accent",
                                  )}
                                >
                                  {/* Checklist progress, along the bottom edge. */}
                                  {progress > 0 && !done ? (
                                    <span
                                      aria-hidden
                                      className="absolute bottom-0 left-0 h-[3px]"
                                      style={{ width: `${progress}%`, backgroundColor: team.colour }}
                                    />
                                  ) : null}
                                  {done && width >= 14 ? (
                                    <svg
                                      viewBox="0 0 12 12"
                                      aria-hidden
                                      className="relative h-2.5 w-2.5 shrink-0"
                                      fill="none"
                                      stroke={`color-mix(in srgb, ${team.colour} 70%, var(--color-text))`}
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M2.5 6.5 5 9l4.5-6" />
                                    </svg>
                                  ) : null}
                                  {inside ? (
                                    <span
                                      aria-hidden
                                      className={clsx(
                                        "relative truncate text-[11px] font-medium whitespace-nowrap",
                                        done ? "text-ink-3 line-through" : "text-ink",
                                      )}
                                    >
                                      {text}
                                    </span>
                                  ) : null}
                                  <span className="sr-only">
                                    {task.key} {task.title}, {STATUS_LABEL[task.status]}
                                  </span>
                                </Link>
                                {/* In text colours, never the team colour; the bar
                                    carries whose it is. */}
                                {inside ? null : (
                                  <span
                                    aria-hidden
                                    className={clsx(
                                      "pointer-events-none absolute top-1/2 -translate-y-1/2 truncate text-[11px] whitespace-nowrap",
                                      done ? "text-ink-3 line-through" : "text-ink-2",
                                    )}
                                    style={
                                      labelAfter
                                        ? { left: barRight + 6, maxWidth: Math.min(LABEL_MAX, Math.max(roomAfter, 0)) }
                                        : { right: chartWidth - barLeft + 6, maxWidth: Math.min(LABEL_MAX, barLeft - 12) }
                                    }
                                  >
                                    {blocked ? "Blocked · " : ""}
                                    {task.title}
                                    {lateBy > 0 ? (
                                      <span className="text-danger">{` · ${formatDays(lateBy)}`}</span>
                                    ) : null}
                                  </span>
                                )}
                              </>
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
      ? { backgroundColor: `color-mix(in srgb, ${accent} 7%, var(--color-bg))` }
      : undefined;
  return (
    <div
      className={clsx(
        "group/row flex",
        tone === "team" && "border-t border-line",
        tone === "task" && "border-b border-line/40",
      )}
      style={{ height }}
    >
      <div
        className={clsx(
          "sticky left-0 z-20 flex shrink-0 items-center border-r border-line",
          rail ? "" : "px-3",
          background,
          tone === "task" && "group-hover/row:bg-elevated",
        )}
        style={{
          width: railWidth,
          ...tint,
          // The team's colour down the left edge of all its rows: one block
          // per sub-team, like the merged team cells in the team's sheet.
          ...(accent ? { boxShadow: `inset 4px 0 0 ${accent}` } : {}),
          ...(tone === "team" && accent
            ? { backgroundColor: `color-mix(in srgb, ${accent} 16%, var(--color-elevated))` }
            : {}),
        }}
      >
        {rail ?? children}
      </div>
      <div
        className={clsx(
          "relative shrink-0",
          tone === "team" && "bg-elevated/60",
          // Labels stay inside their row rather than widening the chart.
          tone === "task" && "overflow-hidden transition-colors group-hover/row:bg-elevated/50",
        )}
        style={{ width: chartWidth, ...tint }}
      >
        {rail ? children : null}
      </div>
    </div>
  );
}

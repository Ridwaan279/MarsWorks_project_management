"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import type { MilestoneView, TaskView, TeamView } from "@/lib/project";
import { Card, EmptyState, HealthPill, TeamDot, formatDays } from "./ui";

interface ImpactResponse {
  projectShiftDays: number;
  affectedTasks: {
    id: string;
    key: string;
    title: string;
    teamId: string;
    teamName: string;
    colour: string;
    shiftDays: number;
  }[];
  affectedTeams: {
    teamId: string;
    name: string;
    colour: string;
    shiftDays: number;
    taskCount: number;
  }[];
  affectedMilestones: {
    id: string;
    name: string;
    shiftDays: number;
    varianceBefore: number;
    varianceAfter: number;
  }[];
}

interface Props {
  tasks: TaskView[];
  teams: TeamView[];
  milestones: MilestoneView[];
  initialTaskId?: string;
}

export function ImpactSimulator({ tasks, teams, milestones, initialTaskId }: Props) {
  const open = useMemo(() => tasks.filter((t) => t.status !== "DONE"), [tasks]);
  const [taskId, setTaskId] = useState(initialTaskId ?? open[0]?.id ?? "");
  const [days, setDays] = useState(7);
  const [result, setResult] = useState<ImpactResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const selected = tasks.find((t) => t.id === taskId);

  useEffect(() => {
    if (!taskId) return;
    const controller = new AbortController();
    // Debounced so dragging the slider does not fire a request per pixel.
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/simulate?taskId=${encodeURIComponent(taskId)}&days=${days}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        setResult(await response.json());
      } catch (cause) {
        if (controller.signal.aborted) return;
        console.error("Simulation failed", cause);
        setError("Could not run the simulation.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [taskId, days]);

  const otherTeams = result?.affectedTeams.filter((t) => t.teamId !== selected?.teamId) ?? [];

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Delay impact</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Pick a task, say how late it runs, and see which other sub-teams and
          milestones move as a result. Nothing here is saved.
        </p>
      </header>

      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <div className="space-y-1.5">
            <label
              className="block text-[11px] font-medium tracking-wide text-ink-faint uppercase"
              htmlFor="impact-task"
            >
              If this task slips
            </label>
            <select
              id="impact-task"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="w-full rounded-md border border-edge bg-surface-2 px-2.5 py-2 text-sm text-ink focus:border-info focus:outline-none"
            >
              {teams.map((team) => {
                const teamTasks = open.filter((t) => t.teamId === team.id);
                if (teamTasks.length === 0) return null;
                return (
                  <optgroup key={team.id} label={team.name}>
                    {teamTasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.key} — {task.title}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              className="block text-[11px] font-medium tracking-wide text-ink-faint uppercase"
              htmlFor="impact-days"
            >
              By {days} {days === 1 ? "day" : "days"}
            </label>
            <input
              id="impact-days"
              type="range"
              min={1}
              max={60}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full accent-[var(--color-mars)]"
            />
            <div className="flex justify-between text-[10px] text-ink-faint">
              <span>1 day</span>
              <span>60 days</span>
            </div>
          </div>
        </div>

        {selected ? (
          <p className="text-xs text-ink-faint">
            <TeamDot colour={teamById.get(selected.teamId)?.colour ?? "#64748b"} />{" "}
            <span className="ml-1">
              {teamById.get(selected.teamId)?.name} &middot;{" "}
              {selected.estimateDays} day estimate &middot; {selected.progress}% done
            </span>
          </p>
        ) : null}
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-late">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className={loading ? "space-y-6 opacity-60" : "space-y-6"}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="space-y-1">
              <p className="text-[11px] tracking-wide text-ink-faint uppercase">
                Other sub-teams hit
              </p>
              <p className="text-2xl font-semibold tabular-nums">{otherTeams.length}</p>
              <p className="text-xs text-ink-faint">
                of {teams.length - 1} teams besides this one
              </p>
            </Card>
            <Card className="space-y-1">
              <p className="text-[11px] tracking-wide text-ink-faint uppercase">
                Tasks pushed back
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {result.affectedTasks.length}
              </p>
              <p className="text-xs text-ink-faint">including the delayed task itself</p>
            </Card>
            <Card className="space-y-1">
              <p className="text-[11px] tracking-wide text-ink-faint uppercase">
                Project finish moves
              </p>
              <p
                className={
                  result.projectShiftDays > 0
                    ? "text-2xl font-semibold tabular-nums text-late"
                    : "text-2xl font-semibold tabular-nums text-ok"
                }
              >
                {result.projectShiftDays > 0 ? `+${result.projectShiftDays}` : "0"} d
              </p>
              <p className="text-xs text-ink-faint">
                {result.projectShiftDays === 0
                  ? "absorbed by existing float"
                  : "beyond today's forecast"}
              </p>
            </Card>
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-ink-muted">Milestones affected</h2>
            {result.affectedMilestones.length === 0 ? (
              <EmptyState
                title="No milestone moves."
                hint="There is enough float between this task and every dated checkpoint."
              />
            ) : (
              <ul className="space-y-2">
                {result.affectedMilestones.map((milestone) => {
                  const target = milestones.find((m) => m.id === milestone.id);
                  return (
                    <li
                      key={milestone.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-edge bg-surface px-4 py-3"
                    >
                      <span className="min-w-0 flex-1 text-sm font-medium">
                        {milestone.name}
                        {target ? (
                          <span className="ml-2 text-xs font-normal text-ink-faint">
                            target {format(new Date(target.targetDate), "d MMM")}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-ink-faint">
                        was {formatDays(milestone.varianceBefore)}
                      </span>
                      <span aria-hidden className="text-ink-faint">
                        &rarr;
                      </span>
                      <HealthPill
                        level={
                          milestone.varianceAfter > 2
                            ? "BEHIND"
                            : milestone.varianceAfter > 0
                              ? "AT_RISK"
                              : "ON_TRACK"
                        }
                        label={formatDays(milestone.varianceAfter)}
                      />
                      <span className="text-xs font-medium tabular-nums text-late">
                        +{milestone.shiftDays}d
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-ink-muted">
                Knock-on to other sub-teams
              </h2>
              {otherTeams.length === 0 ? (
                <EmptyState
                  title="No other sub-team is affected."
                  hint="This delay stays inside its own team."
                />
              ) : (
                <ul className="space-y-2">
                  {otherTeams.map((team) => (
                    <li
                      key={team.teamId}
                      className="flex items-center gap-3 rounded-lg border border-edge bg-surface px-4 py-3"
                    >
                      <TeamDot colour={team.colour} />
                      <span className="min-w-0 flex-1 truncate text-sm">{team.name}</span>
                      <span className="text-xs text-ink-faint">
                        {team.taskCount} {team.taskCount === 1 ? "task" : "tasks"}
                      </span>
                      <span className="text-xs font-medium tabular-nums text-late">
                        up to +{team.shiftDays}d
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-ink-muted">Tasks pushed back</h2>
              {result.affectedTasks.length === 0 ? (
                <EmptyState title="Nothing moves." />
              ) : (
                <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {result.affectedTasks.map((task) => (
                    <li key={task.id}>
                      <Link
                        href={`/board?task=${task.id}`}
                        className="flex items-center gap-3 rounded-lg border border-edge bg-surface px-3 py-2.5 transition-colors hover:bg-surface-2"
                      >
                        <TeamDot colour={task.colour} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{task.title}</p>
                          <p className="text-xs text-ink-faint">
                            <span className="font-mono">{task.key}</span> &middot;{" "}
                            {task.teamName}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-medium tabular-nums text-late">
                          +{task.shiftDays}d
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      ) : loading ? (
        <p className="text-sm text-ink-faint">Running the simulation...</p>
      ) : null}
    </div>
  );
}

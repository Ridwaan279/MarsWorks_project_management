import Link from "next/link";
import { format } from "date-fns";
import { loadProjectView } from "@/lib/project";
import { HEALTH_LABEL, STATUS_LABEL, daysBetween } from "@/lib/domain";
import {
  Avatar,
  Card,
  EmptyState,
  HealthPill,
  ProgressBar,
  StatusBadge,
  TeamDot,
  formatDays,
} from "@/components/ui";

// Always reflect the current database state; a cached dashboard is worse than
// no dashboard when the whole point is "is anyone behind right now".
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const project = await loadProjectView();
  const teamById = new Map(project.teams.map((t) => [t.id, t]));
  const memberById = new Map(project.members.map((m) => [m.id, m]));
  const healthByTeam = new Map(project.health.map((h) => [h.teamId, h]));

  const openTasks = project.tasks.filter((t) => t.status !== "DONE");
  const blocked = openTasks.filter((t) => t.status === "BLOCKED");
  const late = openTasks
    .map((task) => ({ task, scheduled: project.schedule.tasks.get(task.id)! }))
    .filter((row) => row.scheduled.slackDays < 0)
    .sort((a, b) => a.scheduled.slackDays - b.scheduled.slackDays);

  const behindCount = project.health.filter((h) => h.health === "BEHIND").length;
  const atRiskCount = project.health.filter((h) => h.health === "AT_RISK").length;

  // A task with no committed end date cannot be late, cannot appear in a
  // forecast, and cannot warn anyone downstream. Tracking coverage is
  // therefore the first thing to look at: a team at 40% is not "on track",
  // it is unmeasured.
  const undated = openTasks.filter((t) => !t.plannedEnd);
  const coveragePct =
    openTasks.length === 0
      ? 100
      : Math.round(((openTasks.length - undated.length) / openTasks.length) * 100);
  const worstCoverage = project.health
    .map((h) => ({
      health: h,
      team: teamById.get(h.teamId)!,
      open: h.total - h.done,
    }))
    .filter((row) => row.health.undatedTasks > 0)
    .sort((a, b) => b.health.undatedTasks - a.health.undatedTasks);

  return (
    <div className="mx-auto max-w-[1400px] space-y-8 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Project overview</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {project.teams.length} sub-teams &middot; {openTasks.length} open tasks &middot;{" "}
            as of {format(project.asOf, "d MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {behindCount > 0 ? (
            <HealthPill level="BEHIND" label={`${behindCount} behind`} />
          ) : null}
          {atRiskCount > 0 ? (
            <HealthPill level="AT_RISK" label={`${atRiskCount} at risk`} />
          ) : null}
          {behindCount === 0 && atRiskCount === 0 ? (
            <HealthPill level="ON_TRACK" label="All teams on track" />
          ) : null}
        </div>
      </header>

      {undated.length > 0 ? (
        <section className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-warn">
              Schedule coverage: {coveragePct}%
            </h2>
            <p className="text-xs text-ink-muted">
              {undated.length} of {openTasks.length} open tasks have no planned end
              date
            </p>
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            An undated task cannot be forecast, cannot be late, and cannot warn
            the teams waiting on it. These are the gaps where cross-team delays
            come from.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {worstCoverage.map(({ health, team, open }) => (
              <li
                key={team.id}
                className="flex items-center gap-2 rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-xs"
              >
                <TeamDot colour={team.colour} />
                <span>{team.name}</span>
                <span className="font-medium tabular-nums text-warn">
                  {health.undatedTasks}/{open} undated
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {project.schedule.cycles.length > 0 ? (
        <div className="rounded-lg border border-late/30 bg-late/10 px-4 py-3 text-sm text-late">
          <strong className="font-semibold">Circular dependency detected.</strong>{" "}
          {project.schedule.cycles.length} group(s) of tasks depend on each other in a
          loop, so their dates are unreliable until the loop is broken.
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-muted">Milestones</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {project.milestones.map((milestone) => {
            const forecast = project.schedule.milestones.find((m) => m.id === milestone.id)!;
            const level =
              forecast.varianceDays > 2
                ? "BEHIND"
                : forecast.varianceDays > 0
                  ? "AT_RISK"
                  : "ON_TRACK";
            return (
              <Card key={milestone.id} className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium leading-snug">{milestone.name}</h3>
                  {forecast.hasFeedingWork ? (
                    <HealthPill level={level} label={formatDays(forecast.varianceDays)} />
                  ) : (
                    <span
                      title="No task is linked to this milestone, so there is nothing to forecast from."
                      className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-xs whitespace-nowrap text-ink-faint ring-1 ring-inset ring-edge"
                    >
                      no work linked
                    </span>
                  )}
                </div>
                <dl className="space-y-1 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-faint">Target</dt>
                    <dd className="tabular-nums">{format(milestone.targetDate, "d MMM")}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-faint">Forecast</dt>
                    <dd
                      className={
                        !forecast.hasFeedingWork
                          ? "tabular-nums text-ink-faint"
                          : forecast.varianceDays > 0
                            ? "tabular-nums text-late"
                            : "tabular-nums text-ok"
                      }
                    >
                      {forecast.hasFeedingWork ? format(forecast.forecastDate, "d MMM") : "--"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-faint">In</dt>
                    <dd className="tabular-nums text-ink-muted">
                      {daysBetween(project.asOf, milestone.targetDate)} days
                    </dd>
                  </div>
                </dl>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-muted">Sub-team status</h2>
          <Link href="/timeline" className="text-xs text-info hover:underline">
            See the timeline &rarr;
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {project.teams.map((team) => {
            const health = healthByTeam.get(team.id);
            if (!health) return null;
            return (
              <Card key={team.id} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <TeamDot colour={team.colour} />
                    <h3 className="truncate text-sm font-medium">{team.name}</h3>
                  </div>
                  <HealthPill level={health.health} label={HEALTH_LABEL[health.health]} />
                </div>

                {health.total === 0 ? (
                  <p className="rounded-md bg-surface-2 px-2.5 py-2 text-xs text-warn">
                    No tasks at all. This sub-team is not tracked, so nothing it
                    does can appear in any forecast or warn the teams
                    downstream of it.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-ink-faint">Effort complete</span>
                      <span className="font-medium tabular-nums">
                        {health.completionPct}%
                      </span>
                    </div>
                    <ProgressBar value={health.completionPct} colour={team.colour} />
                  </div>
                )}

                <dl className="grid grid-cols-4 gap-1.5 text-center text-xs">
                  <div className="rounded-md bg-surface-2 py-1.5">
                    <dt className="text-[10px] text-ink-faint">Open</dt>
                    <dd className="font-medium tabular-nums">{health.total - health.done}</dd>
                  </div>
                  <div className="rounded-md bg-surface-2 py-1.5">
                    <dt className="text-[10px] text-ink-faint">Active</dt>
                    <dd className="font-medium tabular-nums">{health.inProgress}</dd>
                  </div>
                  <div className="rounded-md bg-surface-2 py-1.5">
                    <dt className="text-[10px] text-ink-faint">Blocked</dt>
                    <dd
                      className={
                        health.blocked > 0
                          ? "font-medium tabular-nums text-late"
                          : "font-medium tabular-nums"
                      }
                    >
                      {health.blocked}
                    </dd>
                  </div>
                  <div className="rounded-md bg-surface-2 py-1.5">
                    <dt className="text-[10px] text-ink-faint">Undated</dt>
                    <dd
                      className={
                        health.undatedTasks > 0
                          ? "font-medium tabular-nums text-warn"
                          : "font-medium tabular-nums"
                      }
                    >
                      {health.undatedTasks}
                    </dd>
                  </div>
                </dl>

                {health.worstPlanVarianceDays > 0 ? (
                  <p className="text-xs text-late">
                    Slipping {health.worstPlanVarianceDays} day(s) past its own
                    planned dates.
                  </p>
                ) : null}

                {health.total === 0 ? null : (
                <p className="text-xs text-ink-faint">
                  Tightest task has{" "}
                  <span
                    className={
                      health.minSlackDays < 0 ? "font-medium text-late" : "font-medium text-ink-muted"
                    }
                  >
                    {formatDays(-health.minSlackDays)}
                  </span>
                  {health.forecastFinish
                    ? ` · finishes ${format(health.forecastFinish, "d MMM")}`
                    : " · all work complete"}
                </p>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-muted">
            Blocked right now ({blocked.length})
          </h2>
          {blocked.length === 0 ? (
            <EmptyState title="Nothing is blocked." hint="Every open task has a clear path." />
          ) : (
            <ul className="space-y-2">
              {blocked.map((task) => {
                const team = teamById.get(task.teamId)!;
                const assignee = task.assigneeId ? memberById.get(task.assigneeId) : null;
                return (
                  <li key={task.id}>
                    <Link
                      href={`/board?task=${task.id}`}
                      className="flex items-start gap-3 rounded-lg border border-edge bg-surface px-3 py-2.5 transition-colors hover:border-edge-soft hover:bg-surface-2"
                    >
                      <TeamDot colour={team.colour} className="mt-1.5" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{task.title}</p>
                        <p className="mt-0.5 text-xs text-ink-faint">
                          <span className="font-mono">{task.key}</span> &middot; {team.name}
                          {task.blockedBy.length > 0
                            ? ` · waiting on ${task.blockedBy.map((b) => b.key).join(", ")}`
                            : ""}
                        </p>
                      </div>
                      {assignee ? <Avatar name={assignee.name} /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-muted">
            Behind schedule ({late.length})
          </h2>
          {late.length === 0 ? (
            <EmptyState
              title="No task is late against its milestone."
              hint="Every chain has slack left."
            />
          ) : (
            <ul className="space-y-2">
              {late.slice(0, 8).map(({ task, scheduled }) => {
                const team = teamById.get(task.teamId)!;
                return (
                  <li key={task.id}>
                    <Link
                      href={`/impact?task=${task.id}`}
                      className="flex items-center gap-3 rounded-lg border border-edge bg-surface px-3 py-2.5 transition-colors hover:border-edge-soft hover:bg-surface-2"
                    >
                      <TeamDot colour={team.colour} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{task.title}</p>
                        <p className="mt-0.5 text-xs text-ink-faint">
                          <span className="font-mono">{task.key}</span> &middot; {team.name}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge status={task.status} label={STATUS_LABEL[task.status]} />
                        <span className="text-xs font-medium tabular-nums text-late">
                          {formatDays(-scheduled.slackDays)}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

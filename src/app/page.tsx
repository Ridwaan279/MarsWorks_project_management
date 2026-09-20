import Link from "next/link";
import { format } from "date-fns";
import { loadProjectView } from "@/lib/project";
import { HEALTH_LABEL } from "@/lib/domain";
import { HealthPill, ProgressBar, TeamDot, formatDays } from "@/components/ui";

// Always reflect the current database state; a cached dashboard is worse than
// no dashboard when the whole point is "is anyone behind right now".
export const dynamic = "force-dynamic";

/**
 * The one screen a sub-team lead opens to answer "is anyone behind?".
 *
 * Deliberately sparse: a milestone strip and one card per sub-team, nothing
 * else. Every number here is a link into the page that explains it, so the
 * overview stays readable and the detail still has somewhere to live.
 */
export default async function OverviewPage() {
  const project = await loadProjectView();
  const healthByTeam = new Map(project.health.map((h) => [h.teamId, h]));

  const openTasks = project.tasks.filter((t) => t.status !== "DONE");
  const undatedCount = openTasks.filter((t) => !t.plannedEnd).length;
  const behindCount = project.health.filter((h) => h.health === "BEHIND").length;
  const atRiskCount = project.health.filter((h) => h.health === "AT_RISK").length;

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-pretty">
            Project overview
          </h1>
          <p className="text-sm text-ink-faint tabular-nums">
            {format(project.asOf, "d MMM yyyy")}
          </p>
        </div>
        <p className="max-w-2xl text-sm text-ink-muted text-pretty">
          {behindCount > 0
            ? `${behindCount} of ${project.teams.length} sub-teams are behind their own plan.`
            : atRiskCount > 0
              ? `${atRiskCount} of ${project.teams.length} sub-teams need attention.`
              : "Every sub-team is on track."}{" "}
          {undatedCount > 0 ? (
            <>
              {undatedCount} open {undatedCount === 1 ? "task has" : "tasks have"} no
              end date, so {undatedCount === 1 ? "it is" : "they are"} invisible to the
              forecast.{" "}
              <Link href="/teams" className="text-mars-soft underline-offset-2 hover:underline">
                See the breakdown
              </Link>
              .
            </>
          ) : null}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
          Milestones
        </h2>
        <ul className="divide-y divide-edge-soft overflow-hidden rounded-xl border border-edge">
          {project.milestones.map((milestone) => {
            const forecast = project.schedule.milestones.find(
              (m) => m.id === milestone.id,
            )!;
            return (
              <li
                key={milestone.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-surface px-4 py-3"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{milestone.name}</span>
                <span className="text-sm tabular-nums text-ink-muted">
                  {format(milestone.targetDate, "d MMM yyyy")}
                </span>
                {forecast.hasFeedingWork ? (
                  <HealthPill
                    level={
                      forecast.varianceDays > 2
                        ? "BEHIND"
                        : forecast.varianceDays > 0
                          ? "AT_RISK"
                          : "ON_TRACK"
                    }
                    label={formatDays(forecast.varianceDays)}
                  />
                ) : (
                  <span
                    title="No task is linked to this milestone, so there is nothing to forecast from."
                    className="rounded-full px-2 py-0.5 text-xs whitespace-nowrap text-ink-faint ring-1 ring-inset ring-edge"
                  >
                    No work linked
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
            Sub-teams
          </h2>
          <Link
            href="/teams"
            className="rounded text-xs text-mars-soft underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-mars"
          >
            Full breakdown &rarr;
          </Link>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {project.teams.map((team) => {
            const health = healthByTeam.get(team.id);
            if (!health) return null;
            const open = health.total - health.done;
            return (
              <li key={team.id}>
                <Link
                  href={`/teams#${team.key.toLowerCase()}`}
                  className="block h-full rounded-xl border border-edge bg-surface p-4 transition-colors hover:border-edge-soft hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-mars"
                >
                  <div className="flex items-center gap-2">
                    <TeamDot colour={team.colour} />
                    <h3 className="min-w-0 flex-1 truncate text-sm font-medium">
                      {team.name}
                    </h3>
                    <HealthPill
                      level={health.health}
                      label={HEALTH_LABEL[health.health]}
                    />
                  </div>

                  {health.total === 0 ? (
                    <p className="mt-3 text-xs text-warn">
                      No tasks yet &mdash; nothing to forecast.
                    </p>
                  ) : (
                    <>
                      <div className="mt-4 space-y-1.5">
                        <ProgressBar value={health.completionPct} colour={team.colour} />
                        <div className="flex justify-between text-xs text-ink-faint">
                          <span className="tabular-nums">{health.completionPct}% done</span>
                          <span className="tabular-nums">
                            {open} open
                            {health.blocked > 0 ? ` · ${health.blocked} blocked` : ""}
                          </span>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-ink-faint">
                        {health.worstPlanVarianceDays > 0 ? (
                          <span className="text-late">
                            {health.worstPlanVarianceDays} days behind plan
                          </span>
                        ) : health.undatedTasks > 0 ? (
                          <span className="text-warn tabular-nums">
                            {health.undatedTasks} undated
                          </span>
                        ) : health.forecastFinish ? (
                          <>Finishes {format(health.forecastFinish, "d MMM")}</>
                        ) : (
                          "All work complete"
                        )}
                      </p>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

import Link from "next/link";
import { format } from "date-fns";
import { loadProjectView } from "@/lib/project";
import { HEALTH_LABEL, STATUS_LABEL } from "@/lib/domain";
import {
  Avatar,
  EmptyState,
  HealthPill,
  ProgressBar,
  StatusBadge,
  TeamDot,
  formatDays,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The detail behind the overview: per-team numbers, and the two lists that
 * need acting on. Kept off the front page so that page stays scannable.
 */
export default async function TeamsPage() {
  const project = await loadProjectView();
  const teamById = new Map(project.teams.map((t) => [t.id, t]));
  const memberById = new Map(project.members.map((m) => [m.id, m]));
  const healthByTeam = new Map(project.health.map((h) => [h.teamId, h]));

  const openTasks = project.tasks.filter((t) => t.status !== "DONE");
  const undated = openTasks.filter((t) => !t.plannedEnd);
  const coveragePct =
    openTasks.length === 0
      ? 100
      : Math.round(((openTasks.length - undated.length) / openTasks.length) * 100);

  // Flagged work is raised by hand, so show it whatever its status: a task
  // someone flagged after finishing it still needs looking at.
  const flagged = project.tasks.filter((t) => t.flagged);
  const blocked = openTasks.filter((t) => t.status === "BLOCKED");
  const late = openTasks
    .map((task) => ({ task, scheduled: project.schedule.tasks.get(task.id)! }))
    .filter((row) => row.scheduled.planVarianceDays !== null && row.scheduled.planVarianceDays > 0)
    .sort((a, b) => (b.scheduled.planVarianceDays ?? 0) - (a.scheduled.planVarianceDays ?? 0));

  return (
    <div className="selectable mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <Link
          href="/"
          className="inline-block rounded text-xs text-ink-3 transition-colors hover:text-ink-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          &larr; Overview
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-pretty sm:text-4xl">
          Sub-team breakdown
        </h1>
        <p className="max-w-2xl text-sm text-ink-2 text-pretty">
          {openTasks.length - undated.length} of {openTasks.length} open tasks carry a
          planned end date ({coveragePct}% coverage). An undated task cannot be
          forecast, cannot be late, and cannot warn the teams waiting on it.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-2">Per sub-team</h2>
        <div data-tour="table" className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[680px] text-sm">
            <caption className="sr-only">
              Progress, open work and schedule position for each sub-team
            </caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-3">
                <th scope="col" className="px-4 py-2.5 font-medium">Sub-team</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Progress</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Open</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Blocked</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Undated</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Vs plan</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Finishes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {project.teams.map((team) => {
                const health = healthByTeam.get(team.id);
                if (!health) return null;
                return (
                  <tr key={team.id} id={team.key.toLowerCase()} className="scroll-mt-20 bg-panel">
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      <span className="flex items-center gap-2">
                        <TeamDot colour={team.colour} />
                        <span className="truncate">{team.name}</span>
                      </span>
                    </th>
                    <td className="px-4 py-3">
                      <HealthPill level={health.health} label={HEALTH_LABEL[health.health]} />
                    </td>
                    <td className="px-4 py-3">
                      {health.total === 0 ? (
                        <span className="text-xs text-ink-3">No tasks</span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <ProgressBar
                            value={health.completionPct}
                            colour={team.colour}
                            className="w-20"
                          />
                          <span className="text-xs tabular-nums text-ink-3">
                            {health.completionPct}%
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {health.total - health.done}
                    </td>
                    <td
                      className={
                        health.blocked > 0
                          ? "px-4 py-3 text-right font-medium tabular-nums text-danger"
                          : "px-4 py-3 text-right tabular-nums text-ink-3"
                      }
                    >
                      {health.blocked}
                    </td>
                    <td
                      className={
                        health.undatedTasks > 0
                          ? "px-4 py-3 text-right font-medium tabular-nums text-warning"
                          : "px-4 py-3 text-right tabular-nums text-ink-3"
                      }
                    >
                      {health.undatedTasks}
                    </td>
                    <td
                      className={
                        health.worstPlanVarianceDays > 0
                          ? "px-4 py-3 text-right font-medium tabular-nums text-danger"
                          : "px-4 py-3 text-right tabular-nums text-ink-3"
                      }
                    >
                      {health.worstPlanVarianceDays > 0
                        ? `+${health.worstPlanVarianceDays}d`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-2">
                      {health.forecastFinish
                        ? format(health.forecastFinish, "d MMM")
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {flagged.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-danger">Flagged ({flagged.length})
          </h2>
          <p className="max-w-2xl text-sm text-ink-2 text-pretty">
            Raised by hand on the board as needing attention.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {flagged.map((task) => {
              const team = teamById.get(task.teamId)!;
              const assignee = task.assigneeId ? memberById.get(task.assigneeId) : null;
              return (
                <li key={task.id}>
                  <Link
                    href={`/board?task=${task.id}`}
                    className="flex items-start gap-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 transition-colors hover:bg-danger/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <TeamDot colour={team.colour} className="mt-1.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{task.title}</span>
                      <span className="mt-0.5 block text-xs text-ink-3">
                        <span className="font-mono" translate="no">{task.key}</span>
                        {" · "}
                        {team.name}
                      </span>
                      {/* The reason is the point of the flag: this page is
                          where leads read them, so it is not truncated. */}
                      {task.flagReason ? (
                        <span className="mt-1.5 block border-l-2 border-danger/50 pl-2 text-xs text-ink-2 text-pretty">
                          {task.flagReason}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 self-start">
                      <StatusBadge status={task.status} label={STATUS_LABEL[task.status]} />
                      {assignee ? <Avatar name={assignee.name} /> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* min-w-0 on each child: a grid item defaults to min-width:auto, so a
          long unbreakable string inside one pushes the item past its track
          and scrolls the whole page sideways on a phone. */}
      <div data-tour="lists" className="grid items-start gap-8 lg:grid-cols-2">
        <section className="min-w-0 space-y-3">
          <h2 className="text-sm font-semibold text-ink-2">Blocked ({blocked.length})
          </h2>
          {blocked.length === 0 ? (
            <EmptyState title="Nothing is blocked." />
          ) : (
            <ul className="space-y-2">
              {blocked.map((task) => {
                const team = teamById.get(task.teamId)!;
                const assignee = task.assigneeId ? memberById.get(task.assigneeId) : null;
                return (
                  <li key={task.id}>
                    <Link
                      href={`/board?task=${task.id}`}
                      className="flex items-start gap-3 rounded-lg border border-line bg-panel px-3 py-2.5 transition-colors hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <TeamDot colour={team.colour} className="mt-1.5" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{task.title}</span>
                        <span className="mt-0.5 block text-xs text-ink-3">
                          {team.name}
                          {task.blockedBy.length > 0
                            ? ` · waiting on ${task.blockedBy.map((b) => b.key).join(", ")}`
                            : ""}
                        </span>
                      </span>
                      {assignee ? <Avatar name={assignee.name} /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="min-w-0 space-y-3">
          <h2 className="text-sm font-semibold text-ink-2">Behind plan ({late.length})
          </h2>
          {late.length === 0 ? (
            <EmptyState title="Nothing is late against its planned dates." />
          ) : (
            <ul className="space-y-2">
              {late.slice(0, 10).map(({ task, scheduled }) => {
                const team = teamById.get(task.teamId)!;
                return (
                  <li key={task.id}>
                    <Link
                      href={`/impact?task=${task.id}`}
                      className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2.5 transition-colors hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <TeamDot colour={team.colour} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{task.title}</span>
                        <span className="mt-0.5 block text-xs text-ink-3">
                          {team.name}
                        </span>
                      </span>
                      <StatusBadge status={task.status} label={STATUS_LABEL[task.status]} />
                      <span className="shrink-0 text-xs font-medium tabular-nums text-danger">
                        +{scheduled.planVarianceDays}d
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {undated.length > 0 ? (
        <section data-tour="undated" className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-2">Undated ({undated.length})
          </h2>
          <p className="max-w-2xl text-sm text-ink-2 text-pretty">
            These carry no planned end date. Give each one a date and it joins the
            forecast.
          </p>
          <ul className="flex flex-wrap gap-2">
            {undated.map((task) => {
              const team = teamById.get(task.teamId)!;
              return (
                <li key={task.id}>
                  <Link
                    href={`/board?task=${task.id}`}
                    className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs transition-colors hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <TeamDot colour={team.colour} />
                    <span className="max-w-[16rem] truncate">{task.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * When each task is expected to happen, and how much it can slip.
 *
 * The rules are meant to be explainable in a sentence each, because the team
 * reads the results (see the Schedule section of a task):
 *
 * - Expected dates are the planned dates. They move later only when a task
 *   this one waits on is expected to finish after this one was due to start
 *   -- then it keeps its planned length from that point -- or when its planned
 *   end has passed and it is not done, when it is expected today: overdue.
 *   A task with no planned dates is expected from today, for its estimate.
 * - Behind plan is the expected finish against the planned end, and counts
 *   only from BEHIND_PLAN_MIN_DAYS.
 * - Spare time is how much later a task could finish before it holds up
 *   something else: a task waiting on it, the milestone it feeds, or the end
 *   of the project. A task with none is "no spare time" (the critical path).
 *
 * Everything here is pure: dates in, dates out, no database and no clock of
 * its own. That keeps it unit-testable and makes the "what if X slips"
 * simulation a matter of re-running the same function against a modified
 * input. Durations are calendar days: a student team does not work a
 * predictable five-day week.
 */

import {
  addDays,
  daysBetween,
  isComplete,
  startOfDay,
  type HealthLevel,
  type TaskStatus,
} from "./domain";

export interface ScheduleTask {
  id: string;
  key: string;
  title: string;
  teamId: string;
  status: TaskStatus;
  /** Fallback effort in calendar days, used when the team has set no dates. */
  estimateDays: number;
  /** What the team committed to. Every planner this replaces is date-driven,
   *  so when both are present they define the duration. */
  plannedStart?: Date | null;
  plannedEnd?: Date | null;
  /** Self-reported completion, 0-100. */
  progress: number;
  /** Hard lower bound on the start date, independent of predecessors. */
  earliestStart?: Date | null;
  /** Date this task is expected to be finished by, if it feeds a milestone. */
  milestoneId?: string | null;
  /**
   * Extra days injected by a what-if run. Added straight to the work that is
   * left, so "slips by 10 days" moves the finish date by exactly 10 days
   * whatever fraction of the task is already complete.
   */
  simulatedDelayDays?: number;
}

export interface ScheduleEdge {
  predecessorId: string;
  successorId: string;
  /** Mandatory gap between predecessor finish and successor start. */
  lagDays: number;
}

export interface ScheduleMilestone {
  id: string;
  name: string;
  targetDate: Date;
}

export interface ScheduleInput {
  tasks: ScheduleTask[];
  edges: ScheduleEdge[];
  milestones: ScheduleMilestone[];
  /** "Today" for the purposes of this run. */
  asOf: Date;
}

/** Why a task's expected dates are what they are. */
export type ExpectedBecause =
  /** On its planned dates. */
  | { kind: "plan" }
  /** Pushed later by a task it waits on, expected to finish late. */
  | { kind: "waits"; taskId: string }
  /** Its planned end has passed and it is not done, so it is due today. */
  | { kind: "overdue" }
  /** No planned dates: from today (or its "not before" date) for its estimate. */
  | { kind: "estimate" }
  /** Held back by its "not before" date. */
  | { kind: "notBefore" }
  | { kind: "done" };

/** What decides how late a task may finish: see latestFinish. */
export type LimitedBy =
  /** A task that waits on this one has to start. */
  | { kind: "task"; taskId: string }
  /** The milestone this task feeds is due. */
  | { kind: "milestone"; milestoneId: string }
  /** Nothing waits on it, so only the end of the project. */
  | { kind: "project" };

export interface ScheduledTask {
  id: string;
  /** Days from today (or its expected start) to its expected finish. */
  remainingDays: number;
  /** Expected start: see ExpectedBecause. */
  earliestStart: Date;
  /** Expected finish. */
  earliestFinish: Date;
  expectedBecause: ExpectedBecause;
  latestStart: Date;
  /** The latest it can finish without holding up `limitedBy`. */
  latestFinish: Date;
  limitedBy: LimitedBy;
  /** Spare time: days it can finish later than expected. Negative means late
   *  already for whatever `limitedBy` names. */
  slackDays: number;
  /** No spare time: if it runs late, so does what it is limited by. */
  isCritical: boolean;
  /**
   * Expected finish against the team's own planned end date. Positive means
   * later than planned; see behindPlanDays for when that counts. Null when no
   * end date is set -- which is itself worth surfacing, since an undated task
   * cannot be late.
   */
  planVarianceDays: number | null;
}

/**
 * A task counts as behind plan only from this many days. A few days either
 * way is the normal give in a student team's plan, not news; flagging it
 * would bury the tasks that really are slipping.
 */
export const BEHIND_PLAN_MIN_DAYS = 7;

/** Days a task is behind its plan, or 0 when it is not (yet) far enough. */
export function behindPlanDays(task: Pick<ScheduledTask, "planVarianceDays"> | undefined): number {
  const days = task?.planVarianceDays ?? 0;
  return days >= BEHIND_PLAN_MIN_DAYS ? days : 0;
}

export interface MilestoneForecast {
  id: string;
  name: string;
  targetDate: Date;
  /** When the feeding work is actually expected to finish. */
  forecastDate: Date;
  /** Positive means late. */
  varianceDays: number;
  /**
   * Whether any task actually feeds this milestone. False means the forecast
   * is just the target date echoed back, which must never be presented as
   * "on time" -- it means nobody has linked work to it.
   */
  hasFeedingWork: boolean;
}

export interface ScheduleResult {
  tasks: Map<string, ScheduledTask>;
  milestones: MilestoneForecast[];
  /** Latest forecast finish across every task. */
  projectFinish: Date;
  /** Dependency cycles found; these edges are ignored so the rest still solves. */
  cycles: string[][];
}

/**
 * The span a team committed to, in calendar days, or null if they have not
 * set both dates. Mechanical, Electrical and the master sheet are all built
 * on hand-set start and end dates, so those win over any estimate field.
 */
export function plannedDurationDays(task: ScheduleTask): number | null {
  if (!task.plannedStart || !task.plannedEnd) return null;
  const span = daysBetween(startOfDay(task.plannedStart), startOfDay(task.plannedEnd));
  return span > 0 ? span : null;
}

/** The duration the scheduler works from: the plan if there is one. */
export function durationDays(task: ScheduleTask): number {
  return plannedDurationDays(task) ?? Math.max(0, task.estimateDays);
}

/**
 * The span of a task's planned dates, or null without both. Unlike
 * plannedDurationDays, a one-day task (start and end the same day) counts.
 */
function plannedSpan(task: ScheduleTask): number | null {
  if (!task.plannedStart || !task.plannedEnd) return null;
  const span = daysBetween(startOfDay(task.plannedStart), startOfDay(task.plannedEnd));
  return span >= 0 ? span : null;
}

/** Work left on a task, in days, never negative. */
export function remainingDays(task: ScheduleTask): number {
  const simulated = Math.max(0, task.simulatedDelayDays ?? 0);
  if (isComplete(task.status)) return simulated;
  const clampedProgress = Math.min(100, Math.max(0, task.progress));
  return Math.ceil(durationDays(task) * (1 - clampedProgress / 100)) + simulated;
}

interface Graph {
  successors: Map<string, ScheduleEdge[]>;
  predecessors: Map<string, ScheduleEdge[]>;
}

function buildGraph(tasks: ScheduleTask[], edges: ScheduleEdge[]): Graph {
  const known = new Set(tasks.map((t) => t.id));
  const successors = new Map<string, ScheduleEdge[]>();
  const predecessors = new Map<string, ScheduleEdge[]>();
  for (const task of tasks) {
    successors.set(task.id, []);
    predecessors.set(task.id, []);
  }
  for (const edge of edges) {
    // Dangling edges can survive a deletion race; drop them rather than throw.
    if (!known.has(edge.predecessorId) || !known.has(edge.successorId)) continue;
    successors.get(edge.predecessorId)!.push(edge);
    predecessors.get(edge.successorId)!.push(edge);
  }
  return { successors, predecessors };
}

/**
 * Kahn's algorithm. Returns the tasks in dependency order plus any nodes that
 * could not be ordered, which is exactly the set involved in a cycle.
 */
function topologicalOrder(
  tasks: ScheduleTask[],
  graph: Graph,
): { order: string[]; cyclic: string[] } {
  const indegree = new Map<string, number>();
  for (const task of tasks) {
    indegree.set(task.id, graph.predecessors.get(task.id)!.length);
  }
  const queue = tasks.filter((t) => indegree.get(t.id) === 0).map((t) => t.id);
  const order: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const edge of graph.successors.get(id)!) {
      const next = indegree.get(edge.successorId)! - 1;
      indegree.set(edge.successorId, next);
      if (next === 0) queue.push(edge.successorId);
    }
  }

  const cyclic = tasks.map((t) => t.id).filter((id) => !order.includes(id));
  return { order, cyclic };
}

/** Each strongly connected group among the cyclic nodes, for reporting. */
function findCycles(cyclic: string[], graph: Graph): string[][] {
  const remaining = new Set(cyclic);
  const cycles: string[][] = [];

  while (remaining.size > 0) {
    const start = remaining.values().next().value as string;
    const group: string[] = [];
    const stack = [start];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (!remaining.has(id)) continue;
      remaining.delete(id);
      group.push(id);
      for (const edge of graph.successors.get(id) ?? []) {
        if (remaining.has(edge.successorId)) stack.push(edge.successorId);
      }
      for (const edge of graph.predecessors.get(id) ?? []) {
        if (remaining.has(edge.predecessorId)) stack.push(edge.predecessorId);
      }
    }
    cycles.push(group);
  }
  return cycles;
}

/**
 * Forward pass then backward pass over the dependency graph.
 *
 * Forward: a task starts on the later of today, its own earliest-start
 * constraint, and every predecessor's finish plus lag. Backward: a task must
 * finish by the earliest of its successors' latest starts, or by its
 * milestone's target date if it feeds one. The gap between the two is slack.
 */
export function computeSchedule(input: ScheduleInput): ScheduleResult {
  const asOf = startOfDay(input.asOf);
  const graph = buildGraph(input.tasks, input.edges);
  const byId = new Map(input.tasks.map((t) => [t.id, t]));
  const { order, cyclic } = topologicalOrder(input.tasks, graph);
  const cycles = cyclic.length > 0 ? findCycles(cyclic, graph) : [];

  // Nodes inside a cycle cannot be ordered. Append them so they still get dates
  // (computed without their cyclic predecessors) and the rest of the plan holds.
  const solveOrder = [...order, ...cyclic];
  const cyclicSet = new Set(cyclic);

  const earliestStart = new Map<string, Date>();
  const earliestFinish = new Map<string, Date>();
  const because = new Map<string, ExpectedBecause>();

  for (const id of solveOrder) {
    const task = byId.get(id)!;
    const span = plannedSpan(task);
    const simulated = Math.max(0, task.simulatedDelayDays ?? 0);

    if (isComplete(task.status)) {
      // Finished work sits where it was planned (today, if it never had
      // dates) and holds nothing up.
      const start = startOfDay(task.plannedStart ?? task.plannedEnd ?? asOf);
      const finish = task.plannedEnd ? startOfDay(task.plannedEnd) : start;
      earliestStart.set(id, start);
      earliestFinish.set(id, addDays(finish < start ? start : finish, simulated));
      because.set(id, { kind: "done" });
      continue;
    }

    // Where it starts before anything pushes it: on its planned dates; or,
    // without both dates, today (no earlier than a lone planned start).
    let start = span !== null ? startOfDay(task.plannedStart!) : asOf;
    let reason: ExpectedBecause = span !== null ? { kind: "plan" } : { kind: "estimate" };
    if (span === null && task.plannedStart && startOfDay(task.plannedStart) > start) {
      start = startOfDay(task.plannedStart);
    }
    if (task.earliestStart && startOfDay(task.earliestStart) > start) {
      start = startOfDay(task.earliestStart);
      reason = { kind: "notBefore" };
    }
    for (const edge of graph.predecessors.get(id)!) {
      // Ignore edges that run back into a cycle; they have no valid finish yet.
      if (cyclicSet.has(id) && cyclicSet.has(edge.predecessorId)) continue;
      // Finished work no longer holds anything up.
      if (isComplete(byId.get(edge.predecessorId)!.status)) continue;
      const predFinish = earliestFinish.get(edge.predecessorId);
      if (!predFinish) continue;
      const candidate = addDays(predFinish, edge.lagDays);
      if (candidate > start) {
        start = candidate;
        reason = { kind: "waits", taskId: edge.predecessorId };
      }
    }

    // Dated work keeps its planned length; undated work takes what is left
    // of its estimate. Either way, work that is not done cannot finish in the
    // past: past its end date, it is due today.
    let finish = addDays(start, span ?? remainingDays({ ...task, simulatedDelayDays: 0 }));
    if (finish < asOf) {
      finish = asOf;
      reason = { kind: "overdue" };
    }
    earliestStart.set(id, start);
    earliestFinish.set(id, addDays(finish, simulated));
    because.set(id, reason);
  }

  // When the work still to do is expected to be finished.
  const projectFinish = input.tasks
    .filter((task) => !isComplete(task.status))
    .reduce<Date>((latest, task) => {
      const finish = earliestFinish.get(task.id)!;
      return finish > latest ? finish : latest;
    }, asOf);

  const milestoneById = new Map(input.milestones.map((m) => [m.id, m]));
  const latestFinish = new Map<string, Date>();
  const latestStart = new Map<string, Date>();
  const limitedBy = new Map<string, LimitedBy>();

  for (const id of [...solveOrder].reverse()) {
    const task = byId.get(id)!;
    // Bounded by its milestone if it feeds one, otherwise by the end of the
    // project (which leaves the work that finishes last no spare time)...
    const milestone = task.milestoneId ? milestoneById.get(task.milestoneId) : undefined;
    let finish = milestone ? startOfDay(milestone.targetDate) : projectFinish;
    let limit: LimitedBy = milestone ? { kind: "milestone", milestoneId: milestone.id } : { kind: "project" };

    // ...or sooner, by when a task waiting on it has to start.
    for (const edge of graph.successors.get(id)!) {
      if (cyclicSet.has(id) && cyclicSet.has(edge.successorId)) continue;
      if (isComplete(byId.get(edge.successorId)!.status)) continue;
      const succStart = latestStart.get(edge.successorId);
      if (!succStart) continue;
      const candidate = addDays(succStart, -edge.lagDays);
      if (candidate < finish) {
        finish = candidate;
        limit = { kind: "task", taskId: edge.successorId };
      }
    }

    // Starting as much later as finishing, for the same length of work.
    const length = daysBetween(earliestStart.get(id)!, earliestFinish.get(id)!);
    latestFinish.set(id, finish);
    latestStart.set(id, addDays(finish, -length));
    limitedBy.set(id, limit);
  }

  const tasks = new Map<string, ScheduledTask>();
  for (const task of input.tasks) {
    const done = isComplete(task.status);
    const es = earliestStart.get(task.id)!;
    const ef = earliestFinish.get(task.id)!;
    const lf = latestFinish.get(task.id)!;
    const slackDays = daysBetween(ef, lf);
    tasks.set(task.id, {
      id: task.id,
      remainingDays: done ? 0 : Math.max(0, daysBetween(es > asOf ? es : asOf, ef)),
      earliestStart: es,
      earliestFinish: ef,
      expectedBecause: because.get(task.id)!,
      latestStart: latestStart.get(task.id)!,
      latestFinish: lf,
      limitedBy: limitedBy.get(task.id)!,
      slackDays,
      isCritical: slackDays <= 0 && !done,
      // Finished work is not behind anything.
      planVarianceDays: task.plannedEnd ? (done ? 0 : daysBetween(startOfDay(task.plannedEnd), ef)) : null,
    });
  }

  const milestones: MilestoneForecast[] = input.milestones.map((milestone) => {
    const feeding = input.tasks.filter((t) => t.milestoneId === milestone.id);
    // A milestone with no work attached is reported at its target rather than
    // at the epoch. Where work does feed it, the forecast is that work's finish
    // and nothing else -- seeding the reduce with the target would clamp the
    // result and hide both early delivery and the true size of a slip.
    const forecastDate =
      feeding.length === 0
        ? startOfDay(milestone.targetDate)
        : feeding.reduce<Date>((latest, task) => {
            const finish = earliestFinish.get(task.id)!;
            return finish > latest ? finish : latest;
          }, earliestFinish.get(feeding[0].id)!);
    return {
      id: milestone.id,
      name: milestone.name,
      targetDate: startOfDay(milestone.targetDate),
      forecastDate,
      varianceDays: daysBetween(startOfDay(milestone.targetDate), forecastDate),
      hasFeedingWork: feeding.length > 0,
    };
  });

  return { tasks, milestones, projectFinish, cycles };
}

export interface DelayImpact {
  /** Tasks whose forecast finish moved, and by how many days. */
  affectedTasks: {
    id: string;
    key: string;
    title: string;
    teamId: string;
    shiftDays: number;
  }[];
  /** Teams with at least one shifted task, and their worst shift. */
  affectedTeams: { teamId: string; shiftDays: number; taskCount: number }[];
  /** Milestones that move, with their variance before and after. */
  affectedMilestones: {
    id: string;
    name: string;
    shiftDays: number;
    varianceBefore: number;
    varianceAfter: number;
  }[];
  projectShiftDays: number;
}

/**
 * Answer the question the sub-team leads actually ask: "if this slips a week,
 * who else is hurt?" Re-runs the schedule with extra days on one task and
 * diffs the result against the baseline.
 */
export function simulateDelay(
  input: ScheduleInput,
  taskId: string,
  delayDays: number,
): DelayImpact {
  const baseline = computeSchedule(input);

  const delayed: ScheduleInput = {
    ...input,
    tasks: input.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            simulatedDelayDays: (task.simulatedDelayDays ?? 0) + delayDays,
          }
        : task,
    ),
  };
  const after = computeSchedule(delayed);

  const affectedTasks: DelayImpact["affectedTasks"] = [];
  for (const task of input.tasks) {
    const before = baseline.tasks.get(task.id)!;
    const now = after.tasks.get(task.id)!;
    const shiftDays = daysBetween(before.earliestFinish, now.earliestFinish);
    if (shiftDays !== 0) {
      affectedTasks.push({
        id: task.id,
        key: task.key,
        title: task.title,
        teamId: task.teamId,
        shiftDays,
      });
    }
  }
  affectedTasks.sort((a, b) => b.shiftDays - a.shiftDays);

  const teamTotals = new Map<string, { shiftDays: number; taskCount: number }>();
  for (const task of affectedTasks) {
    const current = teamTotals.get(task.teamId) ?? { shiftDays: 0, taskCount: 0 };
    teamTotals.set(task.teamId, {
      shiftDays: Math.max(current.shiftDays, task.shiftDays),
      taskCount: current.taskCount + 1,
    });
  }
  const affectedTeams = [...teamTotals.entries()]
    .map(([teamId, v]) => ({ teamId, ...v }))
    .sort((a, b) => b.shiftDays - a.shiftDays);

  const baselineMilestones = new Map(baseline.milestones.map((m) => [m.id, m]));
  const affectedMilestones = after.milestones
    .map((m) => {
      const before = baselineMilestones.get(m.id)!;
      return {
        id: m.id,
        name: m.name,
        shiftDays: daysBetween(before.forecastDate, m.forecastDate),
        varianceBefore: before.varianceDays,
        varianceAfter: m.varianceDays,
      };
    })
    .filter((m) => m.shiftDays !== 0);

  return {
    affectedTasks,
    affectedTeams,
    affectedMilestones,
    projectShiftDays: daysBetween(baseline.projectFinish, after.projectFinish),
  };
}

export interface TeamHealth {
  teamId: string;
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  /** Percentage of estimated effort completed. */
  completionPct: number;
  /** Least slack across the team's unfinished tasks. Negative means late. */
  minSlackDays: number;
  /** Worst milestone variance this team is responsible for. */
  worstVarianceDays: number;
  /** Most days any open task is behind plan; 0 below BEHIND_PLAN_MIN_DAYS. */
  worstPlanVarianceDays: number;
  /** Open tasks with no committed end date -- invisible to any forecast. */
  undatedTasks: number;
  forecastFinish: Date | null;
  health: HealthLevel;
}

/**
 * Roll the schedule up per sub-team. This is what drives the single dashboard
 * that answers "is each sub-team on track" without opening eight tools.
 */
export function computeTeamHealth(
  input: ScheduleInput,
  schedule: ScheduleResult,
  allTeamIds?: string[],
): TeamHealth[] {
  const byTeam = new Map<string, ScheduleTask[]>();
  // Seed every known team, including ones with no tasks at all. A sub-team
  // tracking nothing is the loudest signal on the dashboard, so it must not
  // disappear just because it has no rows.
  for (const id of allTeamIds ?? []) byTeam.set(id, []);
  for (const task of input.tasks) {
    const list = byTeam.get(task.teamId) ?? [];
    list.push(task);
    byTeam.set(task.teamId, list);
  }

  const milestoneVariance = new Map(
    schedule.milestones.map((m) => [m.id, m.varianceDays]),
  );

  return [...byTeam.entries()].map(([teamId, tasks]) => {
    const done = tasks.filter((t) => isComplete(t.status)).length;
    const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
    const blocked = tasks.filter((t) => t.status === "BLOCKED").length;

    const totalEffort = tasks.reduce((sum, t) => sum + durationDays(t), 0);
    const doneEffort = tasks.reduce((sum, t) => sum + durationDays(t) - remainingDays(t), 0);
    // A team with no work is at 0%, not 100%. Reporting an empty plan as
    // complete is exactly the kind of false comfort this dashboard exists to
    // remove.
    const completionPct =
      tasks.length === 0 ? 0 : totalEffort === 0 ? 100 : Math.round((doneEffort / totalEffort) * 100);

    const open = tasks.filter((t) => !isComplete(t.status));
    const minSlackDays = open.length
      ? Math.min(...open.map((t) => schedule.tasks.get(t.id)!.slackDays))
      : Number.POSITIVE_INFINITY;

    const variances = tasks
      .map((t) => (t.milestoneId ? milestoneVariance.get(t.milestoneId) : undefined))
      .filter((v): v is number => v !== undefined);
    const worstVarianceDays = variances.length ? Math.max(...variances) : 0;

    const forecastFinish = open.length
      ? open.reduce<Date>((latest, t) => {
          const finish = schedule.tasks.get(t.id)!.earliestFinish;
          return finish > latest ? finish : latest;
        }, schedule.tasks.get(open[0].id)!.earliestFinish)
      : null;

    const worstPlanVarianceDays = Math.max(0, ...open.map((t) => behindPlanDays(schedule.tasks.get(t.id))));
    const undatedTasks = open.filter((t) => !t.plannedEnd).length;

    // Behind: a task is behind plan, or a milestone will be missed by more
    // than a couple of days. At risk: nothing planned at all (unmeasured, not
    // healthy), something blocked, or a milestone only just missed. Having no
    // spare time is not a risk in itself: the work that finishes last always
    // has none.
    let health: HealthLevel = "ON_TRACK";
    if (tasks.length === 0) {
      health = "AT_RISK";
    } else if (worstPlanVarianceDays > 0 || minSlackDays < -2 || worstVarianceDays > 2) {
      health = "BEHIND";
    } else if (blocked > 0 || minSlackDays < 0 || worstVarianceDays > 0) {
      health = "AT_RISK";
    }

    return {
      teamId,
      total: tasks.length,
      done,
      inProgress,
      blocked,
      completionPct,
      minSlackDays: Number.isFinite(minSlackDays) ? minSlackDays : 0,
      worstVarianceDays,
      worstPlanVarianceDays,
      undatedTasks,
      forecastFinish,
      health,
    };
  });
}

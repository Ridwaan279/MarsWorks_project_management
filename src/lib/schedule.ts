/**
 * Critical-path scheduling over the task dependency graph.
 *
 * Everything here is pure: dates in, dates out, no database and no clock of its
 * own. That keeps it unit-testable and makes the "what if X slips" simulation a
 * matter of re-running the same function against a modified input.
 *
 * Durations are calendar days. A student team does not work a predictable
 * five-day week, so pretending otherwise would add machinery without adding
 * accuracy.
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
  /** Planned effort in calendar days. */
  estimateDays: number;
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

export interface ScheduledTask {
  id: string;
  /** Days of work still to do. Zero once the task is done. */
  remainingDays: number;
  earliestStart: Date;
  earliestFinish: Date;
  latestStart: Date;
  latestFinish: Date;
  /** Days this task can slip before it delays something that matters. */
  slackDays: number;
  isCritical: boolean;
}

export interface MilestoneForecast {
  id: string;
  name: string;
  targetDate: Date;
  /** When the feeding work is actually expected to finish. */
  forecastDate: Date;
  /** Positive means late. */
  varianceDays: number;
}

export interface ScheduleResult {
  tasks: Map<string, ScheduledTask>;
  milestones: MilestoneForecast[];
  /** Latest forecast finish across every task. */
  projectFinish: Date;
  /** Dependency cycles found; these edges are ignored so the rest still solves. */
  cycles: string[][];
}

/** Work left on a task, in days, never negative. */
export function remainingDays(task: ScheduleTask): number {
  const simulated = Math.max(0, task.simulatedDelayDays ?? 0);
  if (isComplete(task.status)) return simulated;
  const clampedProgress = Math.min(100, Math.max(0, task.progress));
  const estimate = Math.max(0, task.estimateDays);
  return Math.ceil(estimate * (1 - clampedProgress / 100)) + simulated;
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

  for (const id of solveOrder) {
    const task = byId.get(id)!;
    let start = asOf;
    if (task.earliestStart) {
      const bound = startOfDay(task.earliestStart);
      if (bound > start) start = bound;
    }
    for (const edge of graph.predecessors.get(id)!) {
      // Ignore edges that run back into a cycle; they have no valid finish yet.
      if (cyclicSet.has(id) && cyclicSet.has(edge.predecessorId)) continue;
      const predFinish = earliestFinish.get(edge.predecessorId);
      if (!predFinish) continue;
      const candidate = addDays(predFinish, edge.lagDays);
      if (candidate > start) start = candidate;
    }
    earliestStart.set(id, start);
    earliestFinish.set(id, addDays(start, remainingDays(task)));
  }

  const projectFinish = input.tasks.reduce<Date>((latest, task) => {
    const finish = earliestFinish.get(task.id)!;
    return finish > latest ? finish : latest;
  }, asOf);

  const milestoneById = new Map(input.milestones.map((m) => [m.id, m]));
  const latestFinish = new Map<string, Date>();
  const latestStart = new Map<string, Date>();

  for (const id of [...solveOrder].reverse()) {
    const task = byId.get(id)!;
    // A sink is bounded by its milestone if it feeds one, otherwise by the
    // project's own forecast finish (which gives it zero slack by definition).
    const milestone = task.milestoneId ? milestoneById.get(task.milestoneId) : undefined;
    let finish = milestone ? startOfDay(milestone.targetDate) : projectFinish;

    const outgoing = graph.successors.get(id)!;
    for (const edge of outgoing) {
      if (cyclicSet.has(id) && cyclicSet.has(edge.successorId)) continue;
      const succStart = latestStart.get(edge.successorId);
      if (!succStart) continue;
      const candidate = addDays(succStart, -edge.lagDays);
      if (candidate < finish) finish = candidate;
    }

    latestFinish.set(id, finish);
    latestStart.set(id, addDays(finish, -remainingDays(task)));
  }

  const tasks = new Map<string, ScheduledTask>();
  for (const task of input.tasks) {
    const es = earliestStart.get(task.id)!;
    const ef = earliestFinish.get(task.id)!;
    const lf = latestFinish.get(task.id)!;
    const ls = latestStart.get(task.id)!;
    const slackDays = daysBetween(es, ls);
    tasks.set(task.id, {
      id: task.id,
      remainingDays: remainingDays(task),
      earliestStart: es,
      earliestFinish: ef,
      latestStart: ls,
      latestFinish: lf,
      slackDays,
      isCritical: slackDays <= 0 && !isComplete(task.status),
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
): TeamHealth[] {
  const byTeam = new Map<string, ScheduleTask[]>();
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

    const totalEffort = tasks.reduce((sum, t) => sum + Math.max(0, t.estimateDays), 0);
    const doneEffort = tasks.reduce(
      (sum, t) =>
        sum + Math.max(0, t.estimateDays) - remainingDays(t),
      0,
    );
    const completionPct = totalEffort === 0 ? 100 : Math.round((doneEffort / totalEffort) * 100);

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

    let health: HealthLevel = "ON_TRACK";
    if (minSlackDays < 0 || worstVarianceDays > 0 || blocked > 0) {
      health = minSlackDays < -2 || worstVarianceDays > 2 ? "BEHIND" : "AT_RISK";
    } else if (minSlackDays <= 2) {
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
      forecastFinish,
      health,
    };
  });
}

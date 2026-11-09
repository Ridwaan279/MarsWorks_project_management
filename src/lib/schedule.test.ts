import { describe, expect, it } from "vitest";
import {
  BEHIND_PLAN_MIN_DAYS,
  behindPlanDays,
  computeSchedule,
  computeTeamHealth,
  durationDays,
  plannedDurationDays,
  remainingDays,
  simulateDelay,
  type ScheduleInput,
  type ScheduleTask,
} from "./schedule";
import { addDays, daysBetween } from "./domain";

const ASOF = new Date("2026-10-01T00:00:00Z");

function task(over: Partial<ScheduleTask> & { id: string }): ScheduleTask {
  return {
    key: over.id.toUpperCase(),
    title: `Task ${over.id}`,
    teamId: "chassis",
    status: "TODO",
    estimateDays: 5,
    progress: 0,
    ...over,
  };
}

function input(over: Partial<ScheduleInput>): ScheduleInput {
  return { tasks: [], edges: [], milestones: [], asOf: ASOF, ...over };
}

describe("remainingDays", () => {
  it("is the full estimate for untouched work", () => {
    expect(remainingDays(task({ id: "a", estimateDays: 5, progress: 0 }))).toBe(5);
  });

  it("scales down with reported progress", () => {
    expect(remainingDays(task({ id: "a", estimateDays: 10, progress: 40 }))).toBe(6);
  });

  it("is zero once the task is done, whatever the progress field says", () => {
    expect(remainingDays(task({ id: "a", status: "DONE", progress: 10 }))).toBe(0);
  });

  it("clamps nonsense progress values", () => {
    expect(remainingDays(task({ id: "a", estimateDays: 4, progress: 150 }))).toBe(0);
    expect(remainingDays(task({ id: "a", estimateDays: 4, progress: -20 }))).toBe(4);
  });
});

describe("planned dates", () => {
  it("takes the duration from committed dates rather than the estimate", () => {
    const t = task({
      id: "a",
      estimateDays: 99,
      plannedStart: ASOF,
      plannedEnd: addDays(ASOF, 11),
    });
    expect(plannedDurationDays(t)).toBe(11);
    expect(durationDays(t)).toBe(11);
    expect(remainingDays(t)).toBe(11);
  });

  it("falls back to the estimate when the team has set no dates", () => {
    const t = task({ id: "a", estimateDays: 7 });
    expect(plannedDurationDays(t)).toBeNull();
    expect(durationDays(t)).toBe(7);
  });

  it("ignores a single date, since one date is not a span", () => {
    expect(plannedDurationDays(task({ id: "a", plannedStart: ASOF }))).toBeNull();
    expect(plannedDurationDays(task({ id: "a", plannedEnd: ASOF }))).toBeNull();
  });

  it("treats the planned start as an earliest-start constraint", () => {
    const result = computeSchedule(
      input({
        tasks: [
          task({
            id: "a",
            plannedStart: addDays(ASOF, 30),
            plannedEnd: addDays(ASOF, 35),
          }),
        ],
      }),
    );
    expect(daysBetween(ASOF, result.tasks.get("a")!.earliestStart)).toBe(30);
  });

  it("reports a slip against the team's own committed end date", () => {
    // Committed to finishing on day 5, but 10 days of work start today.
    const result = computeSchedule(
      input({
        tasks: [
          task({ id: "a", estimateDays: 10, plannedEnd: addDays(ASOF, 5) }),
        ],
      }),
    );
    expect(result.tasks.get("a")!.planVarianceDays).toBe(5);
  });

  it("has no plan variance for a task with no committed end date", () => {
    const result = computeSchedule(input({ tasks: [task({ id: "a" })] }));
    expect(result.tasks.get("a")!.planVarianceDays).toBeNull();
  });
});

describe("expected dates follow the plan", () => {
  const expected = (t: ScheduleTask, more: Partial<ScheduleInput> = {}) =>
    computeSchedule(input({ tasks: [t], ...more })).tasks.get(t.id)!;

  it("expects a task in its planned window to finish on time, ticked checklist or not", () => {
    // Planned for the ten days around today, nothing ticked off yet.
    const s = expected(task({ id: "a", status: "IN_PROGRESS", plannedStart: addDays(ASOF, -5), plannedEnd: addDays(ASOF, 5) }));
    expect(daysBetween(ASOF, s.earliestFinish)).toBe(5);
    expect(s.planVarianceDays).toBe(0);
    expect(s.expectedBecause).toEqual({ kind: "plan" });
  });

  it("counts an overdue task as late by the days since its planned end, not by its whole length again", () => {
    // The task in the report: planned to end 45 days ago, 24 days long, not
    // done. Previously forecast as 24 days of work from today: 69 days late.
    const s = expected(task({ id: "a", status: "IN_PROGRESS", plannedStart: addDays(ASOF, -69), plannedEnd: addDays(ASOF, -45) }));
    expect(daysBetween(ASOF, s.earliestFinish)).toBe(0);
    expect(s.planVarianceDays).toBe(45);
    expect(s.expectedBecause).toEqual({ kind: "overdue" });
  });

  it("moves a task later when what it waits on runs late, keeping its planned length", () => {
    const result = computeSchedule(input({
      tasks: [
        task({ id: "cad", plannedStart: addDays(ASOF, -20), plannedEnd: addDays(ASOF, -10) }),
        task({ id: "build", plannedStart: addDays(ASOF, -10), plannedEnd: addDays(ASOF, 4) }),
      ],
      edges: [{ predecessorId: "cad", successorId: "build", lagDays: 0 }],
    }));
    const build = result.tasks.get("build")!;
    // CAD is overdue, so due today; the build's 14 days start then.
    expect(daysBetween(ASOF, build.earliestStart)).toBe(0);
    expect(build.planVarianceDays).toBe(10);
    expect(build.expectedBecause).toEqual({ kind: "waits", taskId: "cad" });
  });

  it("puts finished work on its planned dates, behind nothing and holding nothing up", () => {
    const result = computeSchedule(input({
      tasks: [
        task({ id: "done", status: "DONE", plannedStart: addDays(ASOF, -30), plannedEnd: addDays(ASOF, -20) }),
        task({ id: "next", plannedStart: addDays(ASOF, -20), plannedEnd: addDays(ASOF, 3) }),
      ],
      edges: [{ predecessorId: "done", successorId: "next", lagDays: 0 }],
    }));
    const done = result.tasks.get("done")!;
    expect(daysBetween(ASOF, done.earliestStart)).toBe(-30);
    expect(daysBetween(ASOF, done.earliestFinish)).toBe(-20);
    expect(done.planVarianceDays).toBe(0);
    expect(done.isCritical).toBe(false);
    expect(result.tasks.get("next")!.expectedBecause).toEqual({ kind: "plan" });
  });

  it("starts a task with no dates today, for its estimate", () => {
    const s = expected(task({ id: "a", estimateDays: 6 }));
    expect(daysBetween(ASOF, s.earliestFinish)).toBe(6);
    expect(s.expectedBecause).toEqual({ kind: "estimate" });
  });

  it("slips a dated task by exactly the simulated delay", () => {
    const scenario = input({ tasks: [task({ id: "a", plannedStart: addDays(ASOF, -2), plannedEnd: addDays(ASOF, 8) })] });
    expect(simulateDelay(scenario, "a", 9).affectedTasks[0].shiftDays).toBe(9);
  });
});

describe("behind plan", () => {
  it(`counts only from ${BEHIND_PLAN_MIN_DAYS} days`, () => {
    expect(BEHIND_PLAN_MIN_DAYS).toBe(7);
    expect(behindPlanDays({ planVarianceDays: 6 })).toBe(0);
    expect(behindPlanDays({ planVarianceDays: 7 })).toBe(7);
    expect(behindPlanDays({ planVarianceDays: 45 })).toBe(45);
    expect(behindPlanDays({ planVarianceDays: -3 })).toBe(0);
    expect(behindPlanDays({ planVarianceDays: null })).toBe(0);
    expect(behindPlanDays(undefined)).toBe(0);
  });

  it("does not mark a team behind for a task a few days late", () => {
    const scenario = input({
      tasks: [task({ id: "a", teamId: "mech", plannedStart: addDays(ASOF, -10), plannedEnd: addDays(ASOF, -3) })],
    });
    const health = computeTeamHealth(scenario, computeSchedule(scenario))[0];
    expect(health.worstPlanVarianceDays).toBe(0);
    expect(health.health).toBe("ON_TRACK");
  });
});

describe("spare time", () => {
  it("names what it is measured to: a waiting task, a milestone, or the end of the project", () => {
    const result = computeSchedule(input({
      tasks: [
        task({ id: "cad", plannedStart: ASOF, plannedEnd: addDays(ASOF, 5) }),
        task({ id: "build", plannedStart: addDays(ASOF, 10), plannedEnd: addDays(ASOF, 20), milestoneId: "m1" }),
        task({ id: "posters", plannedStart: ASOF, plannedEnd: addDays(ASOF, 2) }),
        task({ id: "season", plannedStart: ASOF, plannedEnd: addDays(ASOF, 60) }),
      ],
      edges: [{ predecessorId: "cad", successorId: "build", lagDays: 0 }],
      milestones: [{ id: "m1", name: "Rover rolls", targetDate: addDays(ASOF, 25) }],
    }));
    const cad = result.tasks.get("cad")!;
    // The build may start as late as day 15 and still meet the milestone.
    expect(cad.limitedBy).toEqual({ kind: "task", taskId: "build" });
    expect(cad.slackDays).toBe(10);
    expect(result.tasks.get("build")!.limitedBy).toEqual({ kind: "milestone", milestoneId: "m1" });
    expect(result.tasks.get("build")!.slackDays).toBe(5);
    expect(result.tasks.get("posters")!.limitedBy).toEqual({ kind: "project" });
    expect(result.tasks.get("posters")!.slackDays).toBe(58);
    // The work that finishes last has no spare time.
    expect(result.tasks.get("season")!.slackDays).toBe(0);
    expect(result.tasks.get("season")!.isCritical).toBe(true);
  });
});

describe("computeSchedule forward pass", () => {
  it("chains finish-to-start dependencies", () => {
    const result = computeSchedule(
      input({
        tasks: [
          task({ id: "a", estimateDays: 3 }),
          task({ id: "b", estimateDays: 2 }),
        ],
        edges: [{ predecessorId: "a", successorId: "b", lagDays: 0 }],
      }),
    );
    expect(daysBetween(ASOF, result.tasks.get("a")!.earliestFinish)).toBe(3);
    expect(daysBetween(ASOF, result.tasks.get("b")!.earliestStart)).toBe(3);
    expect(daysBetween(ASOF, result.tasks.get("b")!.earliestFinish)).toBe(5);
  });

  it("honours lag between predecessor and successor", () => {
    const result = computeSchedule(
      input({
        tasks: [task({ id: "a", estimateDays: 3 }), task({ id: "b" })],
        edges: [{ predecessorId: "a", successorId: "b", lagDays: 4 }],
      }),
    );
    expect(daysBetween(ASOF, result.tasks.get("b")!.earliestStart)).toBe(7);
  });

  it("waits for the slowest of several predecessors", () => {
    const result = computeSchedule(
      input({
        tasks: [
          task({ id: "a", estimateDays: 3 }),
          task({ id: "b", estimateDays: 9 }),
          task({ id: "c", estimateDays: 1 }),
        ],
        edges: [
          { predecessorId: "a", successorId: "c", lagDays: 0 },
          { predecessorId: "b", successorId: "c", lagDays: 0 },
        ],
      }),
    );
    expect(daysBetween(ASOF, result.tasks.get("c")!.earliestStart)).toBe(9);
  });

  it("respects an earliest-start constraint that is later than the predecessors", () => {
    const result = computeSchedule(
      input({
        tasks: [
          task({ id: "a", estimateDays: 2 }),
          task({ id: "b", earliestStart: addDays(ASOF, 20) }),
        ],
        edges: [{ predecessorId: "a", successorId: "b", lagDays: 0 }],
      }),
    );
    expect(daysBetween(ASOF, result.tasks.get("b")!.earliestStart)).toBe(20);
  });

  it("does not let completed work push its successors out", () => {
    const result = computeSchedule(
      input({
        tasks: [
          task({ id: "a", estimateDays: 30, status: "DONE" }),
          task({ id: "b", estimateDays: 2 }),
        ],
        edges: [{ predecessorId: "a", successorId: "b", lagDays: 0 }],
      }),
    );
    expect(daysBetween(ASOF, result.tasks.get("b")!.earliestStart)).toBe(0);
  });
});

describe("computeSchedule slack and critical path", () => {
  it("gives zero slack to the chain that drives the milestone", () => {
    const result = computeSchedule(
      input({
        tasks: [
          task({ id: "long", estimateDays: 10, milestoneId: "m1" }),
          task({ id: "short", estimateDays: 2, milestoneId: "m1" }),
        ],
        milestones: [{ id: "m1", name: "Field trial", targetDate: addDays(ASOF, 10) }],
      }),
    );
    expect(result.tasks.get("long")!.slackDays).toBe(0);
    expect(result.tasks.get("long")!.isCritical).toBe(true);
    expect(result.tasks.get("short")!.slackDays).toBe(8);
    expect(result.tasks.get("short")!.isCritical).toBe(false);
  });

  it("reports negative slack when a milestone cannot be met", () => {
    const result = computeSchedule(
      input({
        tasks: [task({ id: "a", estimateDays: 20, milestoneId: "m1" })],
        milestones: [{ id: "m1", name: "Design freeze", targetDate: addDays(ASOF, 5) }],
      }),
    );
    expect(result.tasks.get("a")!.slackDays).toBe(-15);
    expect(result.milestones[0].varianceDays).toBe(15);
  });

  it("marks a milestone with no work linked to it rather than calling it on time", () => {
    const result = computeSchedule(
      input({
        tasks: [task({ id: "a" })],
        milestones: [{ id: "m1", name: "Kickoff", targetDate: addDays(ASOF, 3) }],
      }),
    );
    expect(result.milestones[0].varianceDays).toBe(0);
    // Zero variance here means "nobody linked any work", not "we are fine".
    expect(result.milestones[0].hasFeedingWork).toBe(false);
  });

  it("reports feeding work when tasks are linked to the milestone", () => {
    const result = computeSchedule(
      input({
        tasks: [task({ id: "a", milestoneId: "m1" })],
        milestones: [{ id: "m1", name: "Kickoff", targetDate: addDays(ASOF, 3) }],
      }),
    );
    expect(result.milestones[0].hasFeedingWork).toBe(true);
  });
});

describe("computeSchedule resilience", () => {
  it("reports a dependency cycle instead of hanging", () => {
    const result = computeSchedule(
      input({
        tasks: [task({ id: "a" }), task({ id: "b" })],
        edges: [
          { predecessorId: "a", successorId: "b", lagDays: 0 },
          { predecessorId: "b", successorId: "a", lagDays: 0 },
        ],
      }),
    );
    expect(result.cycles).toHaveLength(1);
    expect(result.cycles[0].sort()).toEqual(["a", "b"]);
    // Every task still gets dates so the rest of the board renders.
    expect(result.tasks.size).toBe(2);
  });

  it("ignores edges pointing at tasks that are not in the input", () => {
    const result = computeSchedule(
      input({
        tasks: [task({ id: "a" })],
        edges: [{ predecessorId: "ghost", successorId: "a", lagDays: 0 }],
      }),
    );
    expect(result.cycles).toHaveLength(0);
    expect(daysBetween(ASOF, result.tasks.get("a")!.earliestStart)).toBe(0);
  });
});

describe("simulateDelay", () => {
  const crossTeam = input({
    tasks: [
      task({ id: "machining", teamId: "chassis", estimateDays: 10, milestoneId: "trial" }),
      task({ id: "wiring", teamId: "avionics", estimateDays: 4, milestoneId: "trial" }),
      task({ id: "integration", teamId: "systems", estimateDays: 5, milestoneId: "trial" }),
      task({ id: "outreach", teamId: "comms", estimateDays: 3 }),
    ],
    edges: [
      { predecessorId: "machining", successorId: "integration", lagDays: 0 },
      { predecessorId: "wiring", successorId: "integration", lagDays: 0 },
    ],
    milestones: [{ id: "trial", name: "Field trial", targetDate: addDays(ASOF, 20) }],
  });

  it("moves the finish date by the full slip even on a part-done task", () => {
    // Half-finished ten-day task: five days of work left. A ten-day slip must
    // push the finish out by ten days, not by five.
    const partial = input({
      tasks: [
        task({ id: "cad", teamId: "chassis", estimateDays: 10, progress: 50 }),
        task({ id: "machining", teamId: "chassis", estimateDays: 4 }),
      ],
      edges: [{ predecessorId: "cad", successorId: "machining", lagDays: 0 }],
    });
    const impact = simulateDelay(partial, "cad", 10);
    expect(impact.affectedTasks.find((t) => t.id === "cad")?.shiftDays).toBe(10);
    expect(impact.affectedTasks.find((t) => t.id === "machining")?.shiftDays).toBe(10);
    expect(impact.projectShiftDays).toBe(10);
  });

  it("propagates a delay to downstream tasks in other teams", () => {
    const impact = simulateDelay(crossTeam, "machining", 5);
    const integration = impact.affectedTasks.find((t) => t.id === "integration");
    expect(integration?.shiftDays).toBe(5);
    expect(impact.affectedTeams.map((t) => t.teamId).sort()).toEqual([
      "chassis",
      "systems",
    ]);
  });

  it("leaves unrelated teams alone", () => {
    const impact = simulateDelay(crossTeam, "machining", 5);
    expect(impact.affectedTasks.some((t) => t.teamId === "comms")).toBe(false);
    expect(impact.affectedTasks.some((t) => t.teamId === "avionics")).toBe(false);
  });

  it("absorbs a delay that fits inside available slack", () => {
    // Wiring finishes on day 4 but integration waits for machining on day 10,
    // so wiring has six days of float before anything downstream moves.
    const impact = simulateDelay(crossTeam, "wiring", 3);
    expect(impact.affectedTasks.some((t) => t.id === "integration")).toBe(false);
    expect(impact.projectShiftDays).toBe(0);
  });

  it("moves the milestone forecast when the critical chain slips", () => {
    const impact = simulateDelay(crossTeam, "machining", 8);
    const trial = impact.affectedMilestones.find((m) => m.id === "trial");
    expect(trial?.shiftDays).toBe(8);
    expect(trial?.varianceBefore).toBe(-5); // 15 days of work against a 20-day target
    expect(trial?.varianceAfter).toBe(3); // now three days late
  });
});

describe("computeTeamHealth", () => {
  it("flags a team that cannot make its milestone as behind", () => {
    const scenario = input({
      tasks: [task({ id: "a", teamId: "chassis", estimateDays: 30, milestoneId: "m1" })],
      milestones: [{ id: "m1", name: "Freeze", targetDate: addDays(ASOF, 5) }],
    });
    const health = computeTeamHealth(scenario, computeSchedule(scenario))[0];
    expect(health.health).toBe("BEHIND");
    expect(health.minSlackDays).toBeLessThan(0);
  });

  it("treats comfortable slack as on track and reports effort completion", () => {
    const scenario = input({
      tasks: [
        task({ id: "a", teamId: "science", estimateDays: 10, progress: 50, milestoneId: "m1" }),
        task({ id: "b", teamId: "science", estimateDays: 10, status: "DONE", milestoneId: "m1" }),
      ],
      milestones: [{ id: "m1", name: "Freeze", targetDate: addDays(ASOF, 60) }],
    });
    const health = computeTeamHealth(scenario, computeSchedule(scenario))[0];
    expect(health.health).toBe("ON_TRACK");
    expect(health.done).toBe(1);
    expect(health.completionPct).toBe(75); // 15 of 20 estimated days retired
  });

  it("keeps a sub-team with no tasks on the dashboard, as unmeasured", () => {
    const scenario = input({ tasks: [task({ id: "a", teamId: "mech" })] });
    const health = computeTeamHealth(scenario, computeSchedule(scenario), [
      "mech",
      "robotics",
      "science",
    ]);
    const robotics = health.find((h) => h.teamId === "robotics")!;
    expect(robotics).toBeDefined();
    expect(robotics.total).toBe(0);
    // An empty plan is 0% done and never "on track" -- that false comfort is
    // the whole failure mode this dashboard exists to remove.
    expect(robotics.completionPct).toBe(0);
    expect(robotics.health).not.toBe("ON_TRACK");
  });

  it("counts open tasks that carry no end date", () => {
    const scenario = input({
      tasks: [
        task({ id: "a", teamId: "drone", plannedEnd: addDays(ASOF, 30) }),
        task({ id: "b", teamId: "drone" }),
        task({ id: "c", teamId: "drone" }),
        task({ id: "d", teamId: "drone", status: "DONE" }),
      ],
    });
    const health = computeTeamHealth(scenario, computeSchedule(scenario))[0];
    expect(health.undatedTasks).toBe(2);
  });

  it("flags a team that is slipping against its own plan", () => {
    const scenario = input({
      tasks: [
        task({
          id: "a",
          teamId: "mech",
          estimateDays: 30,
          plannedEnd: addDays(ASOF, 4),
        }),
      ],
    });
    const health = computeTeamHealth(scenario, computeSchedule(scenario))[0];
    expect(health.worstPlanVarianceDays).toBe(26);
    expect(health.health).toBe("BEHIND");
  });

  it("treats any blocked task as at least at risk", () => {
    const scenario = input({
      tasks: [
        task({ id: "a", teamId: "power", status: "BLOCKED", estimateDays: 2, milestoneId: "m1" }),
      ],
      milestones: [{ id: "m1", name: "Freeze", targetDate: addDays(ASOF, 90) }],
    });
    const health = computeTeamHealth(scenario, computeSchedule(scenario))[0];
    expect(health.blocked).toBe(1);
    expect(health.health).not.toBe("ON_TRACK");
  });
});

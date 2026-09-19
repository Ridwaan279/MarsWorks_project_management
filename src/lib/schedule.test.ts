import { describe, expect, it } from "vitest";
import {
  computeSchedule,
  computeTeamHealth,
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

  it("forecasts a milestone at its target when nothing feeds it", () => {
    const result = computeSchedule(
      input({
        tasks: [task({ id: "a" })],
        milestones: [{ id: "m1", name: "Kickoff", targetDate: addDays(ASOF, 3) }],
      }),
    );
    expect(result.milestones[0].varianceDays).toBe(0);
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

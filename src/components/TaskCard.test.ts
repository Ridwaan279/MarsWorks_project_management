import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TaskView, TeamView } from "@/lib/project";
import { computeSchedule, type ScheduledTask } from "@/lib/schedule";
import { TaskCardBody } from "./TaskCard";

const team: TeamView = {
  id: "sw", key: "SW", name: "Software", colour: "#00aaff", description: null, defaultView: "BOARD",
};
const task: TaskView = {
  id: "task-1", key: "SW-1", title: "Navigation", description: null,
  status: "TODO", priority: "MEDIUM", estimateDays: 3, progress: 0,
  earliestStart: null, plannedStart: null, plannedEnd: null, actualStart: null, actualEnd: null,
  stage: null, ownerLabel: null, notes: null, flagged: false, flagReason: null,
  boardOrder: 1000, teamId: team.id, assigneeIds: [], milestoneId: null, workstreamId: null,
  links: [], subtasks: [], blockedBy: [], blocks: [],
};
function render(overrides: Partial<TaskView>, scheduled?: ScheduledTask) {
  return renderToStaticMarkup(createElement(TaskCardBody, { task: { ...task, ...overrides }, team, assignees: [], scheduled }));
}

describe("task priority and no-spare-time badges", () => {
  // Two independent tasks: the longer task determines the project finish,
  // even when the shorter task has a higher manually assigned priority.
  const longTask = { ...task, id: "long", estimateDays: 10 };
  const shortTask = { ...task, id: "short", estimateDays: 1 };
  const schedule = computeSchedule({ tasks: [longTask, shortTask], edges: [], milestones: [], asOf: new Date("2026-10-27") });
  const onPath = schedule.tasks.get("long")!;
  const offPath = schedule.tasks.get("short")!;

  it("shows Critical priority for a task with spare time", () => {
    expect(offPath.isCritical).toBe(false);
    const html = render({ priority: "CRITICAL" }, offPath);
    expect(html).toContain('title="Critical priority"');
    expect(html).toMatch(/>\s*Critical\s*</);
    expect(html).not.toContain("No spare time");
  });

  it.each(["LOW", "MEDIUM", "HIGH"] as const)("does not label a %s-priority task Critical when it has no spare time", (priority) => {
    expect(onPath.isCritical).toBe(true);
    const html = render({ priority }, onPath);
    expect(html).not.toContain('title="Critical priority"');
    expect(html).not.toMatch(/>\s*Critical\s*</);
    expect(html).toMatch(/>\s*No spare time\s*</);
  });

  it("can show both meanings when a Critical-priority task also has no spare time", () => {
    const html = render({ priority: "CRITICAL" }, onPath);
    expect(html).toContain('title="Critical priority"');
    expect(html).toMatch(/>\s*No spare time\s*</);
  });

  it("updates the priority badge when a saved priority changes in either direction", () => {
    expect(render({ priority: "HIGH" }, offPath)).not.toContain('title="Critical priority"');
    expect(render({ priority: "CRITICAL" }, offPath)).toContain('title="Critical priority"');
    expect(render({ priority: "LOW" }, offPath)).not.toContain('title="Critical priority"');
  });

  it("does not require schedule data to show a selected Critical priority", () => {
    expect(render({ priority: "CRITICAL" })).toContain('title="Critical priority"');
  });

  it("keeps a completed task's selected priority while hiding its no-spare-time badge", () => {
    const html = render({ priority: "CRITICAL", status: "DONE" }, onPath);
    expect(html).toContain('title="Critical priority"');
    expect(html).not.toMatch(/>\s*No spare time\s*</);
  });
});

describe("who a card is for", () => {
  const kai = { id: "kai", name: "Kai Dolan", githubLogin: null, avatarUrl: null, teamId: "sw" };
  const jack = { id: "jack-h", name: "Jack Hamer", githubLogin: null, avatarUrl: null, teamId: "sw" };
  const short = new Map([["kai", "Kai"], ["jack-h", "Jack H"]]);
  const card = (props: { viewerId?: string; ownerLabel?: string | null; flagged?: boolean }) =>
    renderToStaticMarkup(createElement(TaskCardBody, {
      task: { ...task, assigneeIds: ["kai", "jack-h"], ownerLabel: props.ownerLabel ?? null, flagged: props.flagged ?? false },
      team, assignees: [kai, jack], shortNames: short, viewerId: props.viewerId, scheduled: undefined,
    }));

  it("says their first names, not initials", () => {
    const html = card({});
    expect(html).toContain(">Kai</span>");
    expect(html).toContain(">Jack H</span>");
    expect(html).not.toContain(">KD<");
  });

  it("glows only for the person signed in, and says so to screen readers", () => {
    for (const html of [card({ viewerId: "jack-h" }), card({ viewerId: "jack-h", flagged: true })]) {
      expect(html).toContain('data-mine="true"');
      expect(html).toContain("var(--glow-mine)");
      expect(html).toContain("Assigned to you.");
      // Their own name comes first, so it is never folded into "+N".
      expect(html.indexOf(">Jack H</span>")).toBeLessThan(html.indexOf(">Kai</span>"));
    }
    for (const html of [card({}), card({ viewerId: "someone-else" })]) {
      expect(html).not.toContain("data-mine");
      expect(html).not.toContain("--glow-mine");
    }
  });

  it("still names a group alongside the people", () => {
    const html = card({ ownerLabel: "Executive Team" });
    expect(html).toContain("Executive Team");
    expect(html).toContain(">Kai</span>");
    expect(html).not.toContain("Unassigned");
  });
});

describe("behind plan on a card", () => {
  const card = (planVarianceDays: number, status: TaskView["status"] = "IN_PROGRESS") =>
    renderToStaticMarkup(createElement(TaskCardBody, {
      task: { ...task, status }, team, assignees: [],
      scheduled: { ...computeSchedule({ tasks: [task], edges: [], milestones: [], asOf: new Date("2026-10-27") }).tasks.get(task.id)!, planVarianceDays },
    }));

  it("says how far behind, only from a week", () => {
    expect(card(6)).not.toContain("behind");
    expect(card(7)).toContain(">7 days behind<");
    expect(card(45)).toContain(">45 days behind<");
    expect(card(45, "DONE")).not.toContain("behind");
  });
});

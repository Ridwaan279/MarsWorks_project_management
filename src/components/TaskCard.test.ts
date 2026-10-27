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

describe("task priority and critical-path badges", () => {
  // Two independent tasks: the longer task determines the project finish,
  // even when the shorter task has a higher manually assigned priority.
  const longTask = { ...task, id: "long", estimateDays: 10 };
  const shortTask = { ...task, id: "short", estimateDays: 1 };
  const schedule = computeSchedule({ tasks: [longTask, shortTask], edges: [], milestones: [], asOf: new Date("2026-10-27") });
  const onPath = schedule.tasks.get("long")!;
  const offPath = schedule.tasks.get("short")!;

  it("shows Critical priority for a task outside the critical path", () => {
    expect(offPath.isCritical).toBe(false);
    const html = render({ priority: "CRITICAL" }, offPath);
    expect(html).toContain('title="Critical priority"');
    expect(html).toMatch(/>\s*Critical\s*</);
    expect(html).not.toContain("Critical path");
  });

  it.each(["LOW", "MEDIUM", "HIGH"] as const)("does not label a %s-priority task Critical when it is on the critical path", (priority) => {
    expect(onPath.isCritical).toBe(true);
    const html = render({ priority }, onPath);
    expect(html).not.toContain('title="Critical priority"');
    expect(html).not.toMatch(/>\s*Critical\s*</);
    expect(html).toMatch(/>\s*Critical path\s*</);
  });

  it("can show both meanings when a Critical-priority task is also on the critical path", () => {
    const html = render({ priority: "CRITICAL" }, onPath);
    expect(html).toContain('title="Critical priority"');
    expect(html).toMatch(/>\s*Critical path\s*</);
  });

  it("updates the priority badge when a saved priority changes in either direction", () => {
    expect(render({ priority: "HIGH" }, offPath)).not.toContain('title="Critical priority"');
    expect(render({ priority: "CRITICAL" }, offPath)).toContain('title="Critical priority"');
    expect(render({ priority: "LOW" }, offPath)).not.toContain('title="Critical priority"');
  });

  it("does not require schedule data to show a selected Critical priority", () => {
    expect(render({ priority: "CRITICAL" })).toContain('title="Critical priority"');
  });

  it("keeps a completed task's selected priority while hiding its critical-path badge", () => {
    const html = render({ priority: "CRITICAL", status: "DONE" }, onPath);
    expect(html).toContain('title="Critical priority"');
    expect(html).not.toMatch(/>\s*Critical path\s*</);
  });
});

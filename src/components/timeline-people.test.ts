import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MemberView, TaskView, TeamView } from "@/lib/project";
import { computeSchedule } from "@/lib/schedule";
import { Timeline } from "./Timeline";

const team: TeamView = { id: "sw", key: "SW", name: "Software", colour: "#9b72e8", description: null, defaultView: "BOARD" };
const members: MemberView[] = [
  { id: "kai", name: "Kai Dolan", githubLogin: null, avatarUrl: null, teamId: "sw" },
  { id: "jack-s", name: "Jack Sutton", githubLogin: null, avatarUrl: null, teamId: "sw" },
  { id: "jack-h", name: "Jack Hamer", githubLogin: null, avatarUrl: null, teamId: "sw" },
];
const base: TaskView = {
  id: "", key: "", title: "", description: null, status: "IN_PROGRESS", priority: "MEDIUM", estimateDays: 5, progress: 0,
  earliestStart: null, plannedStart: new Date("2026-11-02"), plannedEnd: new Date("2026-11-06"), actualStart: null,
  actualEnd: null, stage: null, ownerLabel: null, notes: null, flagged: false, flagReason: null, boardOrder: 1000,
  teamId: "sw", assigneeIds: [], milestoneId: null, workstreamId: null, links: [], subtasks: [], blockedBy: [], blocks: [],
};
// The longer task sets the finish, so it alone is on the critical path.
const tasks = [
  { ...base, id: "mine", key: "SW-1", title: "Navigation", estimateDays: 10, plannedEnd: new Date("2026-11-13"), assigneeIds: ["kai", "jack-h"] },
  { ...base, id: "theirs", key: "SW-2", title: "Telemetry", estimateDays: 1, assigneeIds: ["jack-s"] },
];
const asOf = new Date("2026-11-03T12:00:00Z");
const schedule = computeSchedule({ tasks, edges: [], milestones: [], asOf });
const render = (viewerId?: string) =>
  renderToStaticMarkup(createElement(Timeline, {
    tasks, teams: [team], members, milestones: [], workstreams: [],
    scheduled: Object.fromEntries(schedule.tasks), asOf: asOf.toISOString(), viewerId,
  }));

describe("the timeline's people", () => {
  it("names who each task is for by first name", () => {
    const html = render();
    expect(html).toContain(">Kai</span>");
    expect(html).toContain(">Jack H</span>");
    expect(html).toContain(">Jack S</span>");
  });

  it("makes the signed-in member's bars glow, and says so in the key", () => {
    const html = render("kai");
    expect(html.match(/var\(--glow-mine-halo\)/g)?.length).toBe(2); // one bar, one key swatch
    expect(html).toContain("your tasks");
    expect(render()).not.toContain("--glow-mine-halo");
    expect(render()).not.toContain("your tasks");
  });

  it("draws the critical path's outline on its bar", () => {
    expect(schedule.tasks.get("mine")?.isCritical).toBe(true);
    expect(schedule.tasks.get("theirs")?.isCritical).toBe(false);
    expect(render().match(/0 0 0 2px var\(--color-accent\)/g)?.length).toBe(1);
  });
});

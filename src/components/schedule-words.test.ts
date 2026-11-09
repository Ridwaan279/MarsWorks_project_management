import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TaskView, TeamView } from "@/lib/project";
import { computeSchedule } from "@/lib/schedule";
import { addDays } from "@/lib/domain";
import { TaskDrawer } from "./TaskDrawer";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const today = new Date("2026-11-09T12:00:00");
const team: TeamView = { id: "mech", key: "MECH", name: "Mechanical", colour: "#f87624", description: null, defaultView: "BOARD" };
const base: TaskView = {
  id: "", key: "", title: "", description: null, status: "IN_PROGRESS", priority: "MEDIUM", estimateDays: 5, progress: 0,
  earliestStart: null, plannedStart: null, plannedEnd: null, actualStart: null, actualEnd: null, stage: null,
  ownerLabel: null, notes: null, flagged: false, flagReason: null, boardOrder: 1000, teamId: "mech", assigneeIds: [],
  milestoneId: null, workstreamId: null, links: [], subtasks: [], blockedBy: [], blocks: [],
};
// Overdue CAD, and the build that waits on it.
const cad = { ...base, id: "cad", key: "MECH-1", title: "Wheel CAD", plannedStart: addDays(today, -69), plannedEnd: addDays(today, -45) };
const build = { ...base, id: "build", key: "MECH-2", title: "Wheel build", plannedStart: addDays(today, -45), plannedEnd: addDays(today, 30) };
const schedule = computeSchedule({
  tasks: [cad, build],
  edges: [{ predecessorId: "cad", successorId: "build", lagDays: 0 }],
  milestones: [],
  asOf: today,
});
const panel = (task: TaskView) =>
  renderToStaticMarkup(createElement(TaskDrawer, {
    task, teams: [team], members: [], milestones: [], workstreams: [], allTasks: [cad, build],
    scheduled: schedule.tasks.get(task.id), canEdit: true, onClose: vi.fn(), onSaved: vi.fn(),
  })).replace(/<!-- -->/g, "");

describe("the Schedule section says where each number comes from", () => {
  it("explains an overdue task in days since its planned end", () => {
    const html = panel(cad);
    expect(html).toContain("45 days behind"); // the section's badge
    expect(html).toContain(">45 days<");
    expect(html).toContain("has passed and it isn&#x27;t marked Done, so it&#x27;s due now.");
    expect(html).toContain("Expected finish minus planned end. Counted from 7 days.");
    expect(html).toContain("Wheel build");
    expect(html).not.toMatch(/>Float<|critical path|>Can start<|>Must finish by<|Forecast finish/i);
  });

  it("names what a waiting task is held up by", () => {
    const html = panel(build);
    expect(html).toContain("It waits on MECH-1 (Wheel CAD)");
    expect(html).toMatch(/>No spare time</);
  });
});

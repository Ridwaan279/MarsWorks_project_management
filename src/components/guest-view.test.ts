import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { KanbanBoard } from "./KanbanBoard";
import { TaskCardBody } from "./TaskCard";
import { TaskDrawer } from "./TaskDrawer";
import { Timeline } from "./Timeline";
import type { MemberView, TaskView, TeamView } from "@/lib/project";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const teams: TeamView[] = [
  { id: "mech", key: "MECH", name: "Mechanical", colour: "#ffaa00", description: null, defaultView: "BOARD" },
  { id: "sw", key: "SW", name: "Software", colour: "#00aaff", description: null, defaultView: "BOARD" },
];
const task: TaskView = {
  id: "task-1", key: "MECH-1", title: "Build wheel assembly", description: "Assembly details",
  status: "IN_PROGRESS", priority: "MEDIUM", estimateDays: 3, progress: 0,
  earliestStart: null, plannedStart: new Date("2026-10-25"), plannedEnd: new Date("2026-10-30"),
  actualStart: null, actualEnd: null, stage: null, ownerLabel: null, notes: "Project notes",
  flagged: false, flagReason: null, boardOrder: 1000, teamId: "mech", assigneeIds: [],
  milestoneId: null, workstreamId: null, links: [{ id: "link-1", label: "Drawing", url: "https://example.com/drawing" }],
  subtasks: [{ id: "subtask-1", title: "Check fit", done: false }], blockedBy: [], blocks: [],
};
const project = {
  tasks: [task, { ...task, id: "task-2", key: "SW-1", title: "Implement navigation", teamId: "sw" }],
  teams, members: [], milestones: [], workstreams: [], scheduled: {}, asOf: "2026-10-26T12:00:00.000Z",
};

describe("read-only guest views", () => {
  it("shows all tasks while removing board mutation controls and drag affordances", () => {
    const html = renderToStaticMarkup(createElement(KanbanBoard, { ...project, canEdit: false, canDelete: false }));
    expect(html).toContain("Build wheel assembly");
    expect(html).toContain("Implement navigation");
    expect(html).not.toContain("Add a task to");
    expect(html).not.toContain('aria-label="Flag MECH-1"');
    expect(html).not.toContain("cursor-grab");
  });

  it("lets guests read task details and follow links, with every field disabled and no save/delete", () => {
    const html = renderToStaticMarkup(createElement(TaskDrawer, {
      task, teams, members: [], milestones: [], workstreams: [], allTasks: [task], scheduled: undefined,
      canEdit: false, onClose: vi.fn(), onSaved: vi.fn(), onDeleted: vi.fn(),
    }));
    expect(html).toMatch(/<fieldset[^>]*disabled/);
    expect(html).toContain("Assembly details");
    expect(html).toContain('href="https://example.com/drawing"');
    expect(html).toContain("Check fit");
    expect(html).not.toContain("Save Changes");
    expect(html).not.toMatch(/>\s*Delete\s*</);
  });

  it("offers guests no add or remove controls in a task, rather than disabled ones", () => {
    const blocker = { depId: "dep-1", id: "task-2", key: "SW-1", title: "Implement navigation", teamId: "sw" };
    const members: MemberView[] = [
      { id: "m1", name: "Ada Lovelace", teamId: "mech", githubLogin: null, avatarUrl: null },
      { id: "m2", name: "Alan Turing", teamId: "sw", githubLogin: null, avatarUrl: null },
    ];
    const drawer = (canEdit: boolean) => renderToStaticMarkup(createElement(TaskDrawer, {
      task: { ...task, blockedBy: [blocker], assigneeIds: ["m1"] }, teams, members, milestones: [], workstreams: [],
      allTasks: [task], scheduled: undefined, canEdit, onClose: vi.fn(), onSaved: vi.fn(),
    }));
    const guest = drawer(false);
    const member = drawer(true);
    for (const control of [
      "Add a checklist item", "Remove &quot;Check fit&quot;", "Add Link", "Remove link Drawing",
      "Add a task this one waits on", "Remove dependency on SW-1", "Add someone from another sub-team",
    ]) {
      expect(guest).not.toContain(control);
      expect(member).toContain(control);
    }
    expect(guest).toContain("Implement navigation");
    expect(guest).toContain("Ada Lovelace");
  });

  it("shows guests a flag only on flagged cards", () => {
    const card = (flagged: boolean, canEdit?: boolean) => renderToStaticMarkup(
      createElement(TaskCardBody, { task: { ...task, flagged }, team: teams[0], assignees: [], scheduled: undefined, canEdit }),
    );
    expect(card(false, false)).not.toContain('<span class="text-ink-3"><svg');
    expect(card(true, false)).toContain('<span class="text-danger"><svg');
    // The drag overlay, which members see, still mirrors the card.
    expect(card(false)).toContain('<span class="text-ink-3"><svg');
  });

  it("preserves member editing controls", () => {
    const html = renderToStaticMarkup(createElement(KanbanBoard, { ...project, canEdit: true, canDelete: false }));
    expect(html).toContain("Add a task to");
    expect(html).toContain('aria-label="Flag MECH-1"');
    expect(html).toContain("cursor-grab");
  });

  it("starts both views with the member's own tasks and retains the team selector", () => {
    const board = renderToStaticMarkup(createElement(KanbanBoard, { ...project, canEdit: true, canDelete: false, initialTeamId: "sw" }));
    const timeline = renderToStaticMarkup(createElement(Timeline, { ...project, initialTeamId: "sw" }));
    for (const html of [board, timeline]) {
      expect(html).toContain("Implement navigation");
      expect(html).not.toContain("Build wheel assembly");
      expect(html).toContain("Software");
    }
  });
});

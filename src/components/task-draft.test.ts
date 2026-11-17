import { describe, expect, it } from "vitest";
import type { TaskView } from "@/lib/project";
import { NO_PENDING, rebaseDraft, refusal } from "./task-draft";

const task: TaskView = {
  id: "t1", key: "MECH-1", title: "Wheel CAD", description: "Old description", status: "IN_PROGRESS", priority: "MEDIUM",
  estimateDays: 5, progress: 0, earliestStart: null, plannedStart: new Date("2026-11-01"), plannedEnd: new Date("2026-11-20"),
  actualStart: null, actualEnd: null, stage: null, ownerLabel: null, notes: null, flagged: false, flagReason: null,
  boardOrder: 1000, teamId: "mech", assigneeIds: ["kai"], milestoneId: null, workstreamId: null,
  links: [{ id: "l1", label: "Drive", url: "https://example.com" }],
  subtasks: [
    { id: "s1", title: "Sketch", done: false },
    { id: "s2", title: "Model", done: false },
    { id: "s3", title: "Review", done: false },
  ],
  blockedBy: [], blocks: [],
};

describe("the task panel keeping in step with the board", () => {
  it("keeps a tick that is still on its way when the board reloads the old list", () => {
    // Ticked s1 on screen; the board reloaded before the server had it.
    const draft = { ...task, subtasks: task.subtasks.map((s) => (s.id === "s1" ? { ...s, done: true } : s)) };
    const fromServer = { ...task };
    const next = rebaseDraft(draft, task, fromServer, { done: { s1: true }, removed: [] });
    expect(next.subtasks.find((s) => s.id === "s1")?.done).toBe(true);
  });

  it("keeps removed items removed until the server confirms", () => {
    const draft = { ...task, subtasks: task.subtasks.filter((s) => s.id !== "s2"), links: [] };
    const next = rebaseDraft(draft, task, { ...task }, { done: {}, removed: ["s2", "l1"] });
    expect(next.subtasks.map((s) => s.id)).toEqual(["s1", "s3"]);
    expect(next.links).toEqual([]);
  });

  it("keeps unsaved typing, and takes everything else from the server", () => {
    const draft = { ...task, description: "Half-typed new description" };
    // Someone else ticked s3 and changed the priority meanwhile.
    const fromServer: TaskView = {
      ...task,
      priority: "HIGH",
      subtasks: task.subtasks.map((s) => (s.id === "s3" ? { ...s, done: true } : s)),
    };
    const next = rebaseDraft(draft, task, fromServer, NO_PENDING);
    expect(next.description).toBe("Half-typed new description");
    expect(next.priority).toBe("HIGH");
    expect(next.subtasks.find((s) => s.id === "s3")?.done).toBe(true);
  });

  it("treats the same dates and people in another form as unchanged", () => {
    const draft = { ...task, plannedStart: "2026-11-01T00:00:00.000Z" as unknown as Date, assigneeIds: ["kai"] };
    const fromServer = { ...task, plannedStart: new Date("2026-11-03"), assigneeIds: ["kai", "dexi"] };
    const next = rebaseDraft(draft, task, fromServer, NO_PENDING);
    expect(next.plannedStart).toEqual(new Date("2026-11-03"));
    expect(next.assigneeIds).toEqual(["kai", "dexi"]);
  });
});

describe("explaining a refused change", () => {
  const reply = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("says what went wrong in words", async () => {
    expect(await refusal(null, "that tick")).toContain("check your connection");
    expect(await refusal(reply(401, { error: "Sign in first." }), "that tick")).toContain("your sign-in has expired");
    expect(await refusal(reply(401, { error: "Your account has changed since you signed in. Sign in again to make changes." }), "that tick"))
      .toContain("Sign in again");
    expect(await refusal(reply(403, { error: "Guest access is read-only." }), "that tick")).toContain("Guest access is read-only.");
    expect(await refusal(reply(404), "that tick")).toContain("removed");
    expect(await refusal(reply(500), "that tick")).toContain("Try again");
  });
});

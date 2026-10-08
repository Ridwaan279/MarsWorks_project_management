import { describe, expect, it } from "vitest";
import {
  deletionLimit,
  mergeFields,
  planSync,
  readDate,
  readStatus,
  type AppMilestone,
  type AppTask,
} from "./merge";
import { FULL_STATUS_WORDS, statusVocabulary, type SheetRow, type SheetTab, type TaskFields } from "./schema";

const SW = "Software Tasks";

function row(n: number, partial: Partial<SheetRow>): SheetRow {
  return {
    row: n,
    id: "",
    title: "",
    assignee: "",
    start: "",
    end: "",
    status: "",
    notes: "",
    ...partial,
  };
}

function fields(partial: Partial<TaskFields> = {}): TaskFields {
  return {
    title: "Repo setup",
    assignee: "",
    start: "2026-09-21",
    end: "2026-09-27",
    status: "Not Started",
    notes: "",
    team: "SW",
    ...partial,
  };
}

function task(key: string, f: Partial<TaskFields> = {}, base: Partial<TaskFields> | null = null): AppTask {
  return { id: `id-${key}`, key, fields: fields(f), base };
}

const sheetOf = (t: AppTask): SheetRow =>
  row(2, {
    id: t.key,
    title: t.fields.title,
    assignee: t.fields.assignee,
    start: t.fields.start,
    end: t.fields.end,
    status: t.fields.status,
    notes: t.fields.notes,
  });

function plan(tabs: SheetTab[], tasks: AppTask[], milestones: AppMilestone[] = [], tombstones: string[] = []) {
  return planSync({ tabs, tasks, milestones, tombstones: new Set(tombstones) });
}

describe("reading cells", () => {
  it("reads ISO and UK day-first dates, and rejects nonsense", () => {
    expect(readDate("2026-10-12")).toBe("2026-10-12");
    expect(readDate("12/10/2026")).toBe("2026-10-12");
    expect(readDate("1/2/27")).toBe("2027-02-01");
    expect(readDate("")).toBe("");
    expect(readDate("31/02/2026")).toBeUndefined();
    expect(readDate("next tuesday")).toBeUndefined();
  });

  it("reads status words into the sheet's own three", () => {
    expect(readStatus("In-Progress")).toBe("In-Progress");
    expect(readStatus("in progress")).toBe("In-Progress");
    expect(readStatus("Complete")).toBe("Complete");
    expect(readStatus("Blocked")).toBe("In-Progress");
    expect(readStatus("")).toBe("Not Started");
    expect(readStatus("Sort of")).toBeUndefined();
  });
});

describe("three-way merge", () => {
  const keys = ["a", "b"] as const;
  type F = { a: string; b: string };

  it("takes the side that moved away from the agreed value", () => {
    const m = mergeFields<F>(keys, { a: "sheet", b: "x" }, { a: "old", b: "app" }, { a: "old", b: "x" });
    expect(m.result).toEqual({ a: "sheet", b: "app" });
    expect(m.changes).toEqual({ a: "sheet" });
    expect(m.sheetNeedsWrite).toBe(true);
  });

  it("lets the website win when both sides changed the same field", () => {
    const m = mergeFields<F>(keys, { a: "sheet", b: "x" }, { a: "app", b: "x" }, { a: "old", b: "x" });
    expect(m.result.a).toBe("app");
    expect(m.conflicts).toEqual(["a"]);
  });

  it("keeps the old base for a field still waiting to be written to the sheet", () => {
    // If that write never lands, the next sync must retry it -- not read the
    // stale cell as a fresh edit made in the sheet.
    const m = mergeFields<F>(keys, { a: "old", b: "x" }, { a: "app", b: "x" }, { a: "old", b: "x" });
    expect(m.base).toEqual({ a: "old", b: "x" });
  });

  it("advances the base once both sides agree", () => {
    const m = mergeFields<F>(keys, { a: "app", b: "x" }, { a: "app", b: "x" }, { a: "old", b: "x" });
    expect(m.base).toEqual({ a: "app", b: "x" });
    expect(m.sheetNeedsWrite).toBe(false);
  });

  it("on first contact lets a filled sheet cell win and an empty one defer", () => {
    const m = mergeFields<F>(keys, { a: "sheet", b: "" }, { a: "app", b: "app" }, null);
    expect(m.result).toEqual({ a: "sheet", b: "app" });
  });
});

describe("planning a sync", () => {
  it("links existing tasks by title on the first sync instead of duplicating them", () => {
    const t = task("SW-3");
    const p = plan([{ name: SW, rows: [row(4, { title: "Repo Setup", start: "2026-09-21", end: "2026-09-27", status: "Not Started" })] }], [t]);
    expect(p.taskCreates).toHaveLength(0);
    expect(p.ops).toEqual([
      expect.objectContaining({ op: "upsert", id: "SW-3", at: { row: 4, title: "Repo Setup" } }),
    ]);
  });

  it("creates a task for a new sheet row and asks for its ID to be written back", () => {
    const p = plan([{ name: SW, rows: [row(9, { title: "Order merch", status: "In-Progress" })] }], []);
    expect(p.taskCreates).toEqual([
      expect.objectContaining({
        fields: expect.objectContaining({ title: "Order merch", status: "In-Progress", team: "SW" }),
        at: { tab: SW, row: 9, title: "Order merch" },
      }),
    ]);
  });

  it("applies a sheet edit to the website", () => {
    const t = task("SW-3", {}, fields());
    const p = plan([{ name: SW, rows: [{ ...sheetOf(t), status: "Complete" }] }], [t]);
    expect(p.taskUpdates[0].changes).toEqual({ status: "Complete" });
    expect(p.ops).toEqual([]);
  });

  it("writes a website edit to the sheet", () => {
    const t = task("SW-3", { status: "Complete" }, fields());
    const p = plan([{ name: SW, rows: [sheetOf(task("SW-3"))] }], [t]);
    expect(p.taskUpdates[0].changes).toEqual({});
    expect(p.ops).toEqual([
      expect.objectContaining({ op: "upsert", id: "SW-3", values: expect.objectContaining({ status: "Complete" }) }),
    ]);
  });

  it("is quiet once both sides agree", () => {
    const t = task("SW-3", {}, fields());
    const p = plan([{ name: SW, rows: [sheetOf(t)] }], [t]);
    expect(p.ops).toEqual([]);
    expect(p.taskUpdates[0].changes).toEqual({});
  });

  it("adds website tasks that have never been in the sheet", () => {
    const t = task("SW-7");
    const p = plan([{ name: SW, rows: [] }], [t]);
    expect(p.ops).toEqual([expect.objectContaining({ op: "upsert", id: "SW-7", tab: SW })]);
  });

  it("deletes a task whose row was deleted from the sheet", () => {
    const keep = task("SW-1", { title: "A" }, fields({ title: "A" }));
    const gone = task("SW-2", { title: "B" }, fields({ title: "B" }));
    const p = plan([{ name: SW, rows: [sheetOf(keep)] }], [keep, gone]);
    expect(p.taskDeletes).toEqual([{ id: "id-SW-2", key: "SW-2" }]);
  });

  it("restores rows instead of deleting when many vanish at once", () => {
    const tasks = Array.from({ length: 8 }, (_, i) =>
      task(`SW-${i + 1}`, { title: `T${i}` }, fields({ title: `T${i}` })),
    );
    const p = plan([{ name: SW, rows: [sheetOf(tasks[0])] }], tasks);
    expect(p.taskDeletes).toEqual([]);
    expect(p.ops.filter((o) => o.op === "upsert")).toHaveLength(7);
    expect(p.warnings.join(" ")).toMatch(/looks like an accident/);
    expect(deletionLimit(8)).toBe(3);
  });

  it("never deletes anything for a tab missing from the sheet", () => {
    const t = task("SW-1", {}, fields());
    const p = plan([{ name: "Mech Tasks", rows: [] }], [t]);
    expect(p.taskDeletes).toEqual([]);
    expect(p.warnings.join(" ")).toMatch(/missing from the sheet/);
  });

  it("removes a row for a task deleted on the website", () => {
    const p = plan([{ name: SW, rows: [row(5, { id: "SW-9", title: "Gone" })] }], [], [], ["SW-9"]);
    expect(p.ops).toEqual([{ op: "delete", id: "SW-9" }]);
    expect(p.taskCreates).toEqual([]);
  });

  it("treats a copied row as a new task rather than a second view of the original", () => {
    const t = task("SW-3", {}, fields());
    const copy = { ...sheetOf(t), row: 5 };
    const p = plan([{ name: SW, rows: [sheetOf(t), copy] }], [t]);
    expect(p.taskCreates).toHaveLength(1);
    expect(p.taskCreates[0].at.row).toBe(5);
  });

  it("moves a task to the sub-team whose tab its row was moved to", () => {
    const t = task("SW-3", {}, fields());
    const p = plan([{ name: "Elec Tasks", rows: [sheetOf(t)] }, { name: SW, rows: [] }], [t]);
    expect(p.taskUpdates[0].changes).toEqual({ team: "ELEC" });
  });

  it("does not overwrite a valid date with one it cannot read", () => {
    const t = task("SW-3", {}, fields());
    const p = plan([{ name: SW, rows: [{ ...sheetOf(t), end: "soon" }] }], [t]);
    expect(p.taskUpdates[0].changes).toEqual({});
    expect(p.ops[0]).toMatchObject({ values: { end: "2026-09-27" } });
    expect(p.warnings.join(" ")).toMatch(/could not read the end date/);
  });

  it("mirrors a task that ends before it starts instead of rewriting it forever", () => {
    // Real data: a task imported with its dates the wrong way round. Treating
    // the pair as unreadable made every sync rewrite the row.
    const inverted = { start: "2026-08-31", end: "2026-08-24" };
    const t = task("ELEC-5", { ...inverted, team: "ELEC" }, fields({ ...inverted, team: "ELEC" }));
    const p = plan([{ name: "Elec Tasks", rows: [sheetOf(t)] }], [t]);
    expect(p.ops).toEqual([]);
    expect(p.warnings.join(" ")).toMatch(/ends before it starts/);
  });

  it("links milestone rows by name and writes their IDs back", () => {
    const m: AppMilestone = { id: "m1", fields: { name: "ARC Video Submissions Open", date: "2027-02-15" }, base: null };
    const p = plan(
      [{ name: "Leadership and Milestones", rows: [row(12, { title: "Milestone: ARC Video Submissions Open", start: "2027-02-15", end: "2027-02-15", status: "Milestone" })] }],
      [],
      [m],
    );
    expect(p.milestoneCreates).toEqual([]);
    expect(p.ops).toEqual([expect.objectContaining({ op: "upsert", id: "M:m1" })]);
    // Assignee and Notes are not the website's to write for a milestone.
    expect(p.ops[0]).not.toHaveProperty("values.notes");
  });

  it("ignores tabs that are not linked to a sub-team, and says so", () => {
    const p = plan([{ name: "Drone Tasks", rows: [row(2, { title: "Fly" })] }], []);
    expect(p.taskCreates).toEqual([]);
    expect(p.warnings.join(" ")).toMatch(/not linked to a sub-team/);
  });
});

describe("status words", () => {
  const ALL = ["Backlog", "Not Started", "In-Progress", "Blocked", "In Review", "Complete", "Milestone"];

  it("uses every status's own word only when the sheet's dropdown offers it", () => {
    expect(statusVocabulary(ALL)).toEqual(FULL_STATUS_WORDS);
    expect(statusVocabulary(undefined).BLOCKED).toBe("In-Progress");
    expect(statusVocabulary(["Blocked"]).IN_REVIEW).toBe("In-Progress");
  });

  it("rewrites a row still showing the old word once the full set is available", () => {
    // Synced before the upgrade: Blocked on the website, In-Progress in the
    // sheet and in the base. After it, the website's word is newer.
    const before = fields({ status: "In-Progress" });
    const t = task("SW-3", { status: "Blocked" }, before);
    const p = planSync({
      tabs: [{ name: SW, rows: [sheetOf(task("SW-3", { status: "In-Progress" }))] }],
      tasks: [t],
      milestones: [],
      tombstones: new Set(),
      vocabulary: statusVocabulary(ALL),
    });
    expect(p.taskUpdates[0].changes).toEqual({});
    expect(p.ops).toEqual([
      expect.objectContaining({ id: "SW-3", values: expect.objectContaining({ status: "Blocked" }) }),
    ]);
  });

  it("takes In Review typed in the sheet as In Review", () => {
    const t = task("SW-3", { status: "In-Progress" }, fields({ status: "In-Progress" }));
    const p = planSync({
      tabs: [{ name: SW, rows: [{ ...sheetOf(t), status: "In Review" }] }],
      tasks: [t],
      milestones: [],
      tombstones: new Set(),
      vocabulary: statusVocabulary(ALL),
    });
    expect(p.taskUpdates[0].changes).toEqual({ status: "In Review" });
  });
});


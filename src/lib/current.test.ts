import { describe, expect, it } from "vitest";
import { addDays, isCurrent } from "./domain";
import type { TaskStatus } from "./domain";

const TODAY = new Date("2026-09-20T00:00:00Z");
const t = (o: Partial<{ status: TaskStatus; plannedStart: Date | null; plannedEnd: Date | null }>) => ({
  status: "TODO" as TaskStatus,
  plannedStart: null,
  plannedEnd: null,
  ...o,
});

describe("isCurrent", () => {
  it("includes a task whose window contains today", () => {
    expect(isCurrent(t({ plannedStart: addDays(TODAY, -3), plannedEnd: addDays(TODAY, 3) }), TODAY)).toBe(true);
  });

  it("includes an unfinished task whose end date has passed", () => {
    expect(isCurrent(t({ plannedStart: addDays(TODAY, -20), plannedEnd: addDays(TODAY, -5) }), TODAY)).toBe(true);
  });

  it("excludes a finished task whose end date has passed", () => {
    expect(isCurrent(t({ status: "DONE", plannedStart: addDays(TODAY, -20), plannedEnd: addDays(TODAY, -5) }), TODAY)).toBe(false);
  });

  it("keeps finished work that is still inside the window, so Done is not empty", () => {
    expect(isCurrent(t({ status: "DONE", plannedStart: addDays(TODAY, -2), plannedEnd: addDays(TODAY, 2) }), TODAY)).toBe(true);
  });

  it("excludes work that has not started yet", () => {
    expect(isCurrent(t({ plannedStart: addDays(TODAY, 5), plannedEnd: addDays(TODAY, 10) }), TODAY)).toBe(false);
  });

  it("excludes a task with no dates at all", () => {
    expect(isCurrent(t({}), TODAY)).toBe(false);
  });

  it("includes a task starting or ending exactly today", () => {
    expect(isCurrent(t({ plannedStart: TODAY, plannedEnd: addDays(TODAY, 4) }), TODAY)).toBe(true);
    expect(isCurrent(t({ plannedStart: addDays(TODAY, -4), plannedEnd: TODAY }), TODAY)).toBe(true);
  });

  it("includes an open-ended task that has already started", () => {
    expect(isCurrent(t({ plannedStart: addDays(TODAY, -4) }), TODAY)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { deriveProgress } from "./progress";

const items = (...done: boolean[]) => done.map((d) => ({ done: d }));

describe("deriveProgress", () => {
  it("is 100 for a finished task, checklist or not", () => {
    expect(deriveProgress("DONE", [], 0)).toBe(100);
    expect(deriveProgress("DONE", items(false, false), 0)).toBe(100);
  });

  it("is the ticked share of the checklist", () => {
    expect(deriveProgress("IN_PROGRESS", items(true, false, false, false), 0)).toBe(25);
    expect(deriveProgress("TODO", items(true, true, false), 90)).toBe(67);
  });

  it("reaches 100 with every item ticked without implying Done", () => {
    expect(deriveProgress("IN_REVIEW", items(true, true), 0)).toBe(100);
  });

  it("keeps a stored value when there is no checklist to derive from", () => {
    expect(deriveProgress("IN_PROGRESS", [], 60)).toBe(60);
  });

  it("drops a leftover 100 when a task is reopened from Done", () => {
    // The bug this guards: the forecast read 100% and scheduled no remaining work.
    expect(deriveProgress("IN_PROGRESS", [], 100)).toBe(0);
  });
});

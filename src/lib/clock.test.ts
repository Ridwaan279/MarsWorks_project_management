import { describe, expect, it } from "vitest";
import { projectDateString, projectToday } from "./clock";

/*
 * The whole point of this module is that the server's timezone is not the
 * team's, so the cases that matter are the hours where the two disagree.
 */
describe("the project clock", () => {
  it("reports tomorrow's date late on a British Summer Time evening", () => {
    // 23:30 UTC on the 21st is 00:30 on the 22nd in Sheffield.
    expect(projectDateString(new Date("2026-09-21T23:30:00Z"))).toBe("2026-09-22");
  });

  it("agrees with UTC during the working day", () => {
    expect(projectDateString(new Date("2026-09-21T09:00:00Z"))).toBe("2026-09-21");
  });

  it("applies no offset in winter, when London is on UTC", () => {
    expect(projectDateString(new Date("2026-12-15T23:30:00Z"))).toBe("2026-12-15");
  });

  it("anchors today at UTC midnight, matching how planned dates are stored", () => {
    const today = projectToday(new Date("2026-09-21T23:30:00Z"));
    expect(today.toISOString()).toBe("2026-09-22T00:00:00.000Z");
  });
});

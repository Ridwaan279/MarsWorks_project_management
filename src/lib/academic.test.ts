import { describe, expect, it } from "vitest";
import { academicBands, academicWeeks } from "./academic";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

function labelOn(y: number, m: number, d: number): string {
  const weeks = academicWeeks(day(y, m, d), 1);
  return weeks[0].label;
}

describe("the 2026/27 year", () => {
  it("names each week as the team's spreadsheet did", () => {
    expect(labelOn(2026, 9, 22)).toBe("Welcome");
    expect(labelOn(2026, 9, 28)).toBe("Wk 1");
    expect(labelOn(2026, 10, 14)).toBe("Wk 3"); // a Wednesday
    expect(labelOn(2026, 12, 14)).toBe("Wk 12");
    expect(labelOn(2026, 12, 21)).toBe("Hol 1");
    expect(labelOn(2027, 1, 11)).toBe("Hol 4");
    expect(labelOn(2027, 1, 25)).toBe("Exam 2");
    expect(labelOn(2027, 2, 8)).toBe("Wk 1");
    expect(labelOn(2027, 3, 15)).toBe("Wk 6");
    expect(labelOn(2027, 3, 29)).toBe("Hol 2");
    expect(labelOn(2027, 4, 12)).toBe("Wk 7");
    expect(labelOn(2027, 5, 17)).toBe("Wk 12");
    expect(labelOn(2027, 6, 7)).toBe("Exam 3");
    expect(academicWeeks(day(2027, 6, 14), 1)[0].kind).toBe("season");
    expect(academicWeeks(day(2026, 9, 14), 1)[0].kind).toBeNull();
  });

  it("starts with the week the chart's first day falls in", () => {
    // 20 Sep 2026 is a Sunday, so its week began the Monday before.
    const weeks = academicWeeks(day(2026, 9, 20), 15);
    expect(weeks.map((w) => w.offset)).toEqual([-6, 1, 8, 15].filter((o) => o < 15));
    expect(weeks[1].label).toBe("Welcome");
    expect(weeks[2].label).toBe("Wk 1");
  });

  it("gives the periods as bands clipped to the chart", () => {
    const bands = academicBands(day(2026, 12, 1), 60);
    expect(bands.map((b) => [b.name, b.offset, b.days])).toEqual([
      ["Semester 1", 0, 20],
      ["Christmas holidays", 20, 28],
      ["January exams", 48, 12],
    ]);
  });
});

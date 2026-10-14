/**
 * The University of Sheffield's 2026/27 year, as the team plans by it.
 *
 * The rover timeline the team kept in a spreadsheet counted in teaching weeks
 * -- "Sem 1 Week 6", "Hols Week 2", "Exam Week 1" -- because that is when
 * people are and are not around. The site's timeline uses the same weeks.
 *
 * Dates from sheffield.ac.uk/about/dates. Update this list each summer; every
 * period starts on a Monday and runs whole weeks.
 */
import { addDays, daysBetween } from "./domain";

export type PeriodKind = "welcome" | "teaching" | "holiday" | "exams" | "season";

interface Period {
  kind: PeriodKind;
  name: string;
  /** The Monday it starts: [year, month (1-12), day]. */
  start: [number, number, number];
  weeks: number;
  /** Teaching weeks only: the number of its first week. */
  firstWeek?: number;
}

export const ACADEMIC_YEAR: readonly Period[] = [
  { kind: "welcome", name: "Welcome week", start: [2026, 9, 21], weeks: 1 },
  { kind: "teaching", name: "Semester 1", start: [2026, 9, 28], weeks: 12, firstWeek: 1 },
  { kind: "holiday", name: "Christmas holidays", start: [2026, 12, 21], weeks: 4 },
  { kind: "exams", name: "January exams", start: [2027, 1, 18], weeks: 3 },
  { kind: "teaching", name: "Semester 2", start: [2027, 2, 8], weeks: 6, firstWeek: 1 },
  { kind: "holiday", name: "Easter holidays", start: [2027, 3, 22], weeks: 3 },
  { kind: "teaching", name: "Semester 2", start: [2027, 4, 12], weeks: 6, firstWeek: 7 },
  { kind: "exams", name: "Summer exams", start: [2027, 5, 24], weeks: 3 },
  { kind: "season", name: "Rover season", start: [2027, 6, 14], weeks: 16 },
];

const startOf = (p: Period) => new Date(p.start[0], p.start[1] - 1, p.start[2]);

/** One week of the year, from its Monday. */
export interface AcademicWeek {
  /** Days from the chart's first day to this week's Monday. */
  offset: number;
  monday: Date;
  kind: PeriodKind | null;
  /** "Wk 3", "Hol 2", "Exam 1", "Welcome"; "" outside the calendar. */
  label: string;
  /** "W3", "H2", "E1": for narrow columns. */
  short: string;
  /** "Semester 1 · Week 3", for tooltips and screen readers. */
  long: string;
}

/** A run of weeks belonging to one period, for the band above the weeks. */
export interface AcademicBand {
  offset: number;
  days: number;
  kind: PeriodKind;
  name: string;
}

function describe(monday: Date): Omit<AcademicWeek, "offset" | "monday"> {
  for (const period of ACADEMIC_YEAR) {
    const index = Math.floor(daysBetween(startOf(period), monday) / 7);
    if (index < 0 || index >= period.weeks) continue;
    switch (period.kind) {
      case "teaching": {
        const n = (period.firstWeek ?? 1) + index;
        return { kind: period.kind, label: `Wk ${n}`, short: `W${n}`, long: `${period.name} · Week ${n}` };
      }
      case "holiday":
        return { kind: period.kind, label: `Hol ${index + 1}`, short: `H${index + 1}`, long: `${period.name} · Week ${index + 1}` };
      case "exams":
        return { kind: period.kind, label: `Exam ${index + 1}`, short: `E${index + 1}`, long: `${period.name} · Week ${index + 1}` };
      case "welcome":
        return { kind: period.kind, label: "Welcome", short: "Wel", long: period.name };
      case "season":
        return { kind: period.kind, label: "", short: "", long: period.name };
    }
  }
  return { kind: null, label: "", short: "", long: "" };
}

/** The Monday on or before a day. */
function mondayOf(day: Date): Date {
  return addDays(day, -((day.getDay() + 6) % 7));
}

/** Every week that touches the chart, starting with the one its first day falls in. */
export function academicWeeks(chartStart: Date, totalDays: number): AcademicWeek[] {
  const weeks: AcademicWeek[] = [];
  for (let monday = mondayOf(chartStart); daysBetween(chartStart, monday) < totalDays; monday = addDays(monday, 7)) {
    weeks.push({ offset: daysBetween(chartStart, monday), monday, ...describe(monday) });
  }
  return weeks;
}

/** The periods the chart passes through, clipped to it. Gaps are left out. */
export function academicBands(chartStart: Date, totalDays: number): AcademicBand[] {
  const bands: AcademicBand[] = [];
  for (const period of ACADEMIC_YEAR) {
    const from = Math.max(0, daysBetween(chartStart, startOf(period)));
    const to = Math.min(totalDays, daysBetween(chartStart, startOf(period)) + period.weeks * 7);
    if (to > from) bands.push({ offset: from, days: to - from, kind: period.kind, name: period.name });
  }
  return bands;
}

/**
 * The schedule in words: what the task panel, timeline and cards say about a
 * task's dates, and where each number comes from. Kept in one place so the
 * same idea is never called two names ("float" here, "slack" there).
 */
import { format } from "date-fns";
import { BEHIND_PLAN_MIN_DAYS, type ScheduledTask } from "@/lib/schedule";

const day = (d: Date | string) => format(new Date(d), "d MMM");
const days = (n: number) => `${n} ${Math.abs(n) === 1 ? "day" : "days"}`;

/** Spare time, as a short label. */
export function spareTimeLabel(slackDays: number): string {
  if (slackDays > 0) return `${days(slackDays)} spare`;
  if (slackDays === 0) return "No spare time";
  return `${days(-slackDays)} too late`;
}

export interface TaskRef {
  key: string;
  title: string;
}

/** Why the task is expected when it is. */
export function expectedReason(
  scheduled: Pick<ScheduledTask, "expectedBecause" | "earliestStart">,
  plannedEnd: Date | string | null,
  taskById: (id: string) => TaskRef | undefined,
): string {
  const because = scheduled.expectedBecause;
  switch (because.kind) {
    case "done":
      return "Done.";
    case "plan":
      return "On its planned dates.";
    case "overdue":
      return plannedEnd
        ? `Its planned end (${day(plannedEnd)}) has passed and it isn't marked Done, so it's due now.`
        : "It isn't marked Done, so it's due now.";
    case "waits": {
      const before = taskById(because.taskId);
      return before
        ? `It waits on ${before.key} (${before.title}), which isn't expected to finish until ${day(scheduled.earliestStart)}. It keeps its planned length from then.`
        : "It waits on a task that is expected to finish late.";
    }
    case "estimate":
      return "It has no planned dates, so it's expected from today for its estimated length.";
    case "notBefore":
      return `It can't start before ${day(scheduled.earliestStart)}.`;
  }
}

/** How "behind plan" is worked out, for a task that has a planned end. */
export function behindPlanReason(planVarianceDays: number): string {
  if (planVarianceDays >= BEHIND_PLAN_MIN_DAYS) {
    return `Expected finish minus planned end. Counted from ${BEHIND_PLAN_MIN_DAYS} days.`;
  }
  if (planVarianceDays > 0) {
    return `${days(planVarianceDays)} after its planned end, but under ${BEHIND_PLAN_MIN_DAYS} days doesn't count as behind.`;
  }
  return "Expected to finish by its planned end date.";
}

/** What the task's spare time is measured to, and what happens if it runs over. */
export function spareTimeReason(
  scheduled: Pick<ScheduledTask, "slackDays" | "latestFinish" | "limitedBy">,
  taskById: (id: string) => TaskRef | undefined,
  milestoneName: (id: string) => string | undefined,
): string {
  const by = scheduled.limitedBy;
  const deadline = day(scheduled.latestFinish);
  const what =
    by.kind === "task"
      ? (() => {
          const next = taskById(by.taskId);
          return next ? `${next.key} (${next.title}), which waits on it, has to start` : "a task waiting on it has to start";
        })()
      : by.kind === "milestone"
        ? `the ${milestoneName(by.milestoneId) ?? "milestone"} milestone it feeds is due`
        : "the project's last piece of work is expected to finish";
  if (scheduled.slackDays > 0) return `It can finish as late as ${deadline}, when ${what}, without holding anything up.`;
  if (scheduled.slackDays === 0) {
    return by.kind === "project"
      ? "It's among the last work in the project, so if it runs late, so does the project."
      : `It needs to finish by ${deadline}, when ${what}: if it runs late, so does that.`;
  }
  return `It's expected after ${deadline}, when ${what}, so it will hold that up.`;
}

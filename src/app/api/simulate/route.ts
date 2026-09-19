import { NextResponse } from "next/server";
import { z } from "zod";
import { loadProjectSnapshot, toScheduleInput } from "@/lib/project";
import { simulateDelay } from "@/lib/schedule";

const query = z.object({
  taskId: z.string().min(1),
  days: z.coerce.number().int().min(1).max(180),
});

/**
 * "If this task slips N days, who else is hurt?" Runs the scheduler twice and
 * diffs, so the answer always matches what the timeline is showing.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = query.safeParse({
    taskId: url.searchParams.get("taskId"),
    days: url.searchParams.get("days"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide taskId and days (1-180)" },
      { status: 400 },
    );
  }

  const snapshot = await loadProjectSnapshot();
  if (!snapshot.tasks.some((t) => t.id === parsed.data.taskId)) {
    return NextResponse.json({ error: "Unknown task" }, { status: 404 });
  }

  const impact = simulateDelay(
    toScheduleInput(snapshot),
    parsed.data.taskId,
    parsed.data.days,
  );

  const teamById = new Map(snapshot.teams.map((t) => [t.id, t]));
  return NextResponse.json({
    ...impact,
    affectedTeams: impact.affectedTeams.map((team) => ({
      ...team,
      name: teamById.get(team.teamId)?.name ?? "Unknown team",
      colour: teamById.get(team.teamId)?.colour ?? "#64748b",
    })),
    affectedTasks: impact.affectedTasks.map((task) => ({
      ...task,
      teamName: teamById.get(task.teamId)?.name ?? "Unknown team",
      colour: teamById.get(task.teamId)?.colour ?? "#64748b",
    })),
  });
}

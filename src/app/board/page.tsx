import { loadProjectView } from "@/lib/project";
import { KanbanBoard } from "@/components/KanbanBoard";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>;
}) {
  const [project, params] = await Promise.all([loadProjectView(), searchParams]);

  // The scheduler returns a Map; client components need a plain object.
  const scheduled = Object.fromEntries(project.schedule.tasks);

  return (
    <KanbanBoard
      tasks={project.tasks}
      teams={project.teams}
      members={project.members}
      milestones={project.milestones}
      scheduled={scheduled}
      initialTaskId={params.task}
    />
  );
}

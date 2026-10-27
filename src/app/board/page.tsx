import { loadProjectView } from "@/lib/project";
import { KanbanBoard } from "@/components/KanbanBoard";
import { currentViewer, mayDeleteTasks, mayEditProject } from "@/lib/auth/session";
import { defaultTeamId } from "@/lib/team-filter";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>;
}) {
  const [project, params, viewer] = await Promise.all([loadProjectView(), searchParams, currentViewer()]);

  // The scheduler returns a Map; client components need a plain object.
  const scheduled = Object.fromEntries(project.schedule.tasks);

  return (
    <KanbanBoard
      tasks={project.tasks}
      teams={project.teams}
      members={project.members}
      milestones={project.milestones}
      workstreams={project.workstreams}
      scheduled={scheduled}
      asOf={project.asOf.toISOString()}
      initialTaskId={params.task}
      initialTeamId={defaultTeamId(viewer.member)}
      canEdit={mayEditProject(viewer)}
      canDelete={mayDeleteTasks(viewer)}
    />
  );
}

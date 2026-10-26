import { loadProjectView } from "@/lib/project";
import { Timeline } from "@/components/Timeline";
import { currentViewer } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const [project, viewer] = await Promise.all([loadProjectView(), currentViewer()]);
  return (
    <Timeline
      tasks={project.tasks}
      teams={project.teams}
      members={project.members}
      milestones={project.milestones}
      workstreams={project.workstreams}
      scheduled={Object.fromEntries(project.schedule.tasks)}
      asOf={project.asOf.toISOString()}
      initialTeamId={viewer.member?.teamId ?? undefined}
    />
  );
}

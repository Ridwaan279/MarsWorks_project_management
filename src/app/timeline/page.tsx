import { loadProjectView } from "@/lib/project";
import { Timeline } from "@/components/Timeline";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const project = await loadProjectView();
  return (
    <Timeline
      tasks={project.tasks}
      teams={project.teams}
      members={project.members}
      milestones={project.milestones}
      workstreams={project.workstreams}
      scheduled={Object.fromEntries(project.schedule.tasks)}
      asOf={project.asOf.toISOString()}
    />
  );
}

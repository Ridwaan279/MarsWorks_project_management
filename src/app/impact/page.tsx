import { loadProjectSnapshot } from "@/lib/project";
import { ImpactSimulator } from "@/components/ImpactSimulator";

export const dynamic = "force-dynamic";

export default async function ImpactPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>;
}) {
  const [snapshot, params] = await Promise.all([loadProjectSnapshot(), searchParams]);
  return (
    <ImpactSimulator
      tasks={snapshot.tasks}
      teams={snapshot.teams}
      milestones={snapshot.milestones}
      initialTaskId={params.task}
    />
  );
}

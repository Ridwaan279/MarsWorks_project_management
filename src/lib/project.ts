import { prisma } from "./db";
import {
  computeSchedule,
  computeTeamHealth,
  type ScheduleInput,
  type ScheduleResult,
  type TeamHealth,
} from "./schedule";
import type { ProjectStage, TaskPriority, TaskStatus, TeamView as TeamViewMode } from "./domain";

export interface TeamView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  colour: string;
  defaultView: TeamViewMode;
}

export interface WorkstreamView {
  id: string;
  teamId: string;
  code: string | null;
  name: string;
  position: number;
}

export interface MemberView {
  id: string;
  name: string;
  githubLogin: string | null;
  avatarUrl: string | null;
  teamId: string | null;
}

export interface MilestoneView {
  id: string;
  name: string;
  description: string | null;
  targetDate: Date;
}

export interface TaskRef {
  id: string;
  key: string;
  title: string;
  teamId: string;
}

export interface TaskView {
  id: string;
  key: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  estimateDays: number;
  progress: number;
  earliestStart: Date | null;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  stage: ProjectStage | null;
  ownerLabel: string | null;
  notes: string | null;
  boardOrder: number;
  teamId: string;
  assigneeId: string | null;
  milestoneId: string | null;
  workstreamId: string | null;
  links: { id: string; label: string; url: string }[];
  subtasks: { id: string; title: string; done: boolean }[];
  /** Tasks that must finish before this one can start. */
  blockedBy: TaskRef[];
  /** Tasks waiting on this one. */
  blocks: TaskRef[];
}

export interface ProjectSnapshot {
  teams: TeamView[];
  workstreams: WorkstreamView[];
  members: MemberView[];
  milestones: MilestoneView[];
  tasks: TaskView[];
  edges: { predecessorId: string; successorId: string; lagDays: number }[];
  asOf: Date;
}

export interface ProjectView extends ProjectSnapshot {
  schedule: ScheduleResult;
  health: TeamHealth[];
}

/**
 * One query per entity rather than a deeply nested include. The dataset is
 * small (hundreds of rows, not millions) and this keeps the shape flat enough
 * to hand straight to client components.
 */
export async function loadProjectSnapshot(): Promise<ProjectSnapshot> {
  const [teams, workstreams, members, milestones, tasks, dependencies] = await Promise.all([
    prisma.team.findMany({ orderBy: { position: "asc" } }),
    prisma.workstream.findMany({ orderBy: [{ teamId: "asc" }, { position: "asc" }] }),
    prisma.member.findMany({ orderBy: { name: "asc" } }),
    prisma.milestone.findMany({ orderBy: { targetDate: "asc" } }),
    prisma.task.findMany({
      orderBy: [{ boardOrder: "asc" }, { key: "asc" }],
      include: {
        links: { orderBy: { createdAt: "asc" } },
        subtasks: { orderBy: { position: "asc" } },
      },
    }),
    prisma.taskDependency.findMany(),
  ]);

  const taskMeta = new Map<string, TaskRef>(
    tasks.map((t) => [t.id, { id: t.id, key: t.key, title: t.title, teamId: t.teamId }]),
  );

  const blockedBy = new Map<string, TaskRef[]>();
  const blocks = new Map<string, TaskRef[]>();
  for (const dep of dependencies) {
    const pred = taskMeta.get(dep.predecessorId);
    const succ = taskMeta.get(dep.successorId);
    if (!pred || !succ) continue;
    blockedBy.set(dep.successorId, [...(blockedBy.get(dep.successorId) ?? []), pred]);
    blocks.set(dep.predecessorId, [...(blocks.get(dep.predecessorId) ?? []), succ]);
  }

  return {
    asOf: new Date(),
    teams: teams.map((t) => ({
      id: t.id,
      key: t.key,
      name: t.name,
      description: t.description,
      colour: t.colour,
      defaultView: t.defaultView as TeamViewMode,
    })),
    workstreams: workstreams.map((w) => ({
      id: w.id,
      teamId: w.teamId,
      code: w.code,
      name: w.name,
      position: w.position,
    })),
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      githubLogin: m.githubLogin,
      avatarUrl: m.avatarUrl,
      teamId: m.teamId,
    })),
    milestones: milestones.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      targetDate: m.targetDate,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      key: t.key,
      title: t.title,
      description: t.description,
      status: t.status as TaskStatus,
      priority: t.priority as TaskPriority,
      estimateDays: t.estimateDays,
      progress: t.progress,
      earliestStart: t.earliestStart,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      actualStart: t.actualStart,
      actualEnd: t.actualEnd,
      stage: t.stage as ProjectStage | null,
      ownerLabel: t.ownerLabel,
      notes: t.notes,
      boardOrder: t.boardOrder,
      teamId: t.teamId,
      assigneeId: t.assigneeId,
      milestoneId: t.milestoneId,
      workstreamId: t.workstreamId,
      links: t.links.map((l) => ({ id: l.id, label: l.label, url: l.url })),
      subtasks: t.subtasks.map((st) => ({ id: st.id, title: st.title, done: st.done })),
      blockedBy: blockedBy.get(t.id) ?? [],
      blocks: blocks.get(t.id) ?? [],
    })),
    edges: dependencies.map((d) => ({
      predecessorId: d.predecessorId,
      successorId: d.successorId,
      lagDays: d.lagDays,
    })),
  };
}

export function toScheduleInput(snapshot: ProjectSnapshot): ScheduleInput {
  return {
    asOf: snapshot.asOf,
    edges: snapshot.edges,
    milestones: snapshot.milestones.map((m) => ({
      id: m.id,
      name: m.name,
      targetDate: m.targetDate,
    })),
    tasks: snapshot.tasks.map((t) => ({
      id: t.id,
      key: t.key,
      title: t.title,
      teamId: t.teamId,
      status: t.status,
      estimateDays: t.estimateDays,
      progress: t.progress,
      earliestStart: t.earliestStart,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      milestoneId: t.milestoneId,
    })),
  };
}

export async function loadProjectView(): Promise<ProjectView> {
  const snapshot = await loadProjectSnapshot();
  const input = toScheduleInput(snapshot);
  const schedule = computeSchedule(input);
  const health = computeTeamHealth(
    input,
    schedule,
    snapshot.teams.map((t) => t.id),
  );
  return { ...snapshot, schedule, health };
}

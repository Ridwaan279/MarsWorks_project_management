/**
 * Run one Google Sheets sync pass against the database.
 *
 * The Apps Script sends the whole sheet; this loads the website's side, asks
 * planSync what should change, applies the website half here, and returns the
 * sheet half as instructions for the script to carry out.
 */
import type { Prisma } from "@/generated/prisma";
import { prisma } from "../db";
import { deriveProgress } from "../progress";
import { keyAllocator } from "../task-keys";
import { planSync, type AppMilestone, type AppTask } from "./merge";
import {
  MILESTONE_ID_PREFIX,
  SHEET_STATUS,
  STATUS_FROM_SHEET,
  TEAM_TAB,
  milestoneTitle,
  type MilestoneFields,
  type SheetOp,
  type SheetTab,
  type TaskFields,
} from "./schema";

export interface SyncSummary {
  tasksCreated: number;
  tasksUpdated: number;
  tasksDeleted: number;
  milestonesCreated: number;
  milestonesUpdated: number;
  milestonesDeleted: number;
  rowsWritten: number;
  rowsDeleted: number;
  conflicts: number;
  warnings: string[];
}

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const toDate = (day: string) => (day ? new Date(`${day}T00:00:00.000Z`) : null);

// Any stable number; it only has to be the same for every sync.
const SYNC_LOCK = 0x5ee75;

export async function runSheetSync(
  tabs: SheetTab[],
  reason: string,
): Promise<{ ops: SheetOp[]; summary: SyncSummary }> {
  const run = await prisma.sheetSyncRun.create({ data: { reason } });
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Serialise syncs. An edit and a scheduled run arriving together would
        // otherwise both see a new row without an ID and both create it.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SYNC_LOCK})`;
        return syncInTransaction(tx, tabs);
      },
      { timeout: 50_000, maxWait: 20_000 },
    );
    await prisma.sheetSyncRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), ok: true, summary: result.summary as unknown as Prisma.InputJsonValue },
    });
    await pruneRuns();
    return result;
  } catch (error) {
    await prisma.sheetSyncRun
      .update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          ok: false,
          summary: { error: error instanceof Error ? error.message : String(error) },
        },
      })
      .catch(() => {});
    throw error;
  }
}

/** The log is for "when did it last work"; a few hundred runs is plenty. */
async function pruneRuns() {
  const keep = await prisma.sheetSyncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 1,
    skip: 300,
    select: { startedAt: true },
  });
  if (keep[0]) {
    await prisma.sheetSyncRun.deleteMany({ where: { startedAt: { lt: keep[0].startedAt } } });
  }
}

async function syncInTransaction(tx: Prisma.TransactionClient, tabs: SheetTab[]) {
  const [teams, members, tasks, milestones, tombstones] = await Promise.all([
    tx.team.findMany({ select: { id: true, key: true } }),
    tx.member.findMany({ select: { id: true, name: true } }),
    tx.task.findMany({
      select: {
        id: true,
        key: true,
        title: true,
        ownerLabel: true,
        plannedStart: true,
        plannedEnd: true,
        status: true,
        notes: true,
        progress: true,
        actualStart: true,
        sheetBase: true,
        team: { select: { key: true } },
        assignee: { select: { name: true } },
        subtasks: { select: { done: true } },
      },
    }),
    tx.milestone.findMany({
      select: { id: true, name: true, targetDate: true, sheetBase: true },
    }),
    tx.syncTombstone.findMany({ select: { ref: true } }),
  ]);

  const teamIdByKey = new Map(teams.map((t) => [t.key, t.id]));
  const memberByName = new Map(members.map((m) => [m.name.trim().toLowerCase(), m.id]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const appTasks: AppTask[] = tasks
    .filter((t) => TEAM_TAB[t.team.key])
    .map((t) => ({
      id: t.id,
      key: t.key,
      fields: {
        title: t.title,
        // The sheet's Assignee is free text. A label written as the planner
        // had it ("Executive Team") is the truer reading; a member's name is
        // the fallback when that is all there is.
        assignee: t.ownerLabel ?? t.assignee?.name ?? "",
        start: isoDay(t.plannedStart),
        end: isoDay(t.plannedEnd),
        status: SHEET_STATUS[t.status],
        notes: t.notes ?? "",
        team: t.team.key,
      },
      base: (t.sheetBase as Partial<TaskFields> | null) ?? null,
    }));

  const appMilestones: AppMilestone[] = milestones.map((m) => ({
    id: m.id,
    fields: { name: m.name, date: isoDay(m.targetDate) },
    base: (m.sheetBase as Partial<MilestoneFields> | null) ?? null,
  }));

  const plan = planSync({
    tabs,
    tasks: appTasks,
    milestones: appMilestones,
    tombstones: new Set(tombstones.map((t) => t.ref)),
  });

  const summary: SyncSummary = {
    tasksCreated: 0,
    tasksUpdated: 0,
    tasksDeleted: 0,
    milestonesCreated: 0,
    milestonesUpdated: 0,
    milestonesDeleted: 0,
    rowsWritten: 0,
    rowsDeleted: 0,
    conflicts: plan.conflicts,
    warnings: plan.warnings,
  };
  const ops: SheetOp[] = [...plan.ops];

  /** Website columns for a set of changed sheet fields. */
  function taskData(changes: Partial<TaskFields>, current?: (typeof tasks)[number]) {
    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (changes.title !== undefined) data.title = changes.title;
    if (changes.notes !== undefined) data.notes = changes.notes || null;
    if (changes.start !== undefined) data.plannedStart = toDate(changes.start);
    if (changes.end !== undefined) data.plannedEnd = toDate(changes.end);
    if (changes.assignee !== undefined) {
      // An exact member name links the person; anything else is kept as
      // written, and replaces whoever was linked before.
      const memberId = memberByName.get(changes.assignee.trim().toLowerCase());
      data.assigneeId = memberId ?? null;
      data.ownerLabel = memberId ? null : changes.assignee || null;
    }
    if (changes.team !== undefined) {
      const teamId = teamIdByKey.get(changes.team);
      if (teamId) data.teamId = teamId;
    }
    if (changes.status !== undefined) {
      const status = STATUS_FROM_SHEET[changes.status] ?? "TODO";
      data.status = status;
      // The same side effects a move on the board has; see the task PATCH.
      if ((status === "IN_PROGRESS" || status === "DONE") && !current?.actualStart) {
        data.actualStart = new Date();
      }
      data.actualEnd = status === "DONE" ? new Date() : null;
      data.progress = deriveProgress(status, current?.subtasks ?? [], current?.progress ?? 0);
    }
    return data;
  }

  for (const update of plan.taskUpdates) {
    const current = taskById.get(update.id);
    if (!current) continue;
    const data = taskData(update.changes, current);
    const changed = Object.keys(update.changes).length > 0;
    if (changed) summary.tasksUpdated += 1;
    if (changed || JSON.stringify(current.sheetBase) !== JSON.stringify(update.base)) {
      await tx.task.update({
        where: { id: update.id },
        data: { ...data, sheetBase: update.base as Prisma.InputJsonValue },
      });
    }
  }

  // New rows from the sheet. Keys are allocated per team, past every key that
  // team has ever had.
  const allocators = new Map<string, () => string>();
  for (const create of plan.taskCreates) {
    const teamId = teamIdByKey.get(create.fields.team);
    if (!teamId) continue;
    let next = allocators.get(create.fields.team);
    if (!next) {
      next = await keyAllocator(tx, create.fields.team);
      allocators.set(create.fields.team, next);
    }
    const status = STATUS_FROM_SHEET[create.fields.status] ?? "TODO";
    const first = await tx.task.findFirst({
      where: { status },
      orderBy: { boardOrder: "asc" },
      select: { boardOrder: true },
    });
    const key = next();
    const memberId = memberByName.get(create.fields.assignee.trim().toLowerCase());
    await tx.task.create({
      data: {
        key,
        title: create.fields.title,
        teamId,
        status,
        notes: create.fields.notes || null,
        ownerLabel: memberId ? null : create.fields.assignee || null,
        assigneeId: memberId ?? null,
        plannedStart: toDate(create.fields.start),
        plannedEnd: toDate(create.fields.end),
        progress: deriveProgress(status, [], 0),
        actualStart: status === "IN_PROGRESS" || status === "DONE" ? new Date() : null,
        actualEnd: status === "DONE" ? new Date() : null,
        boardOrder: (first?.boardOrder ?? 1000) - 1000,
        sheetBase: create.base as Prisma.InputJsonValue,
      },
    });
    summary.tasksCreated += 1;
    ops.push({
      op: "upsert",
      id: key,
      tab: create.at.tab,
      at: { row: create.at.row, title: create.at.title },
      values: {
        title: create.fields.title,
        assignee: create.fields.assignee,
        start: create.fields.start,
        end: create.fields.end,
        status: create.fields.status,
        notes: create.fields.notes,
      },
    });
  }

  for (const removed of plan.taskDeletes) {
    await tx.task.delete({ where: { id: removed.id } });
    await tx.syncTombstone.upsert({
      where: { ref: removed.key },
      create: { ref: removed.key },
      update: {},
    });
    summary.tasksDeleted += 1;
  }

  const milestoneById = new Map(milestones.map((m) => [m.id, m]));
  for (const update of plan.milestoneUpdates) {
    const current = milestoneById.get(update.id);
    if (!current) continue;
    const data: Prisma.MilestoneUpdateInput = {};
    if (update.changes.name !== undefined) data.name = update.changes.name;
    if (update.changes.date) data.targetDate = toDate(update.changes.date)!;
    const changed = Object.keys(data).length > 0;
    if (changed) summary.milestonesUpdated += 1;
    if (changed || JSON.stringify(current.sheetBase) !== JSON.stringify(update.base)) {
      await tx.milestone.update({
        where: { id: update.id },
        data: { ...data, sheetBase: update.base as Prisma.InputJsonValue },
      });
    }
  }

  for (const create of plan.milestoneCreates) {
    const created = await tx.milestone.create({
      data: {
        name: create.fields.name,
        targetDate: toDate(create.fields.date)!,
        sheetBase: create.base as Prisma.InputJsonValue,
      },
    });
    summary.milestonesCreated += 1;
    ops.push({
      op: "upsert",
      id: MILESTONE_ID_PREFIX + created.id,
      tab: create.at.tab,
      at: { row: create.at.row, title: create.at.title },
      values: {
        title: milestoneTitle(create.fields.name),
        start: create.fields.date,
        end: create.fields.date,
        status: "Milestone",
      },
    });
  }

  for (const removed of plan.milestoneDeletes) {
    await tx.milestone.delete({ where: { id: removed.id } });
    await tx.syncTombstone.upsert({
      where: { ref: MILESTONE_ID_PREFIX + removed.id },
      create: { ref: MILESTONE_ID_PREFIX + removed.id },
      update: {},
    });
    summary.milestonesDeleted += 1;
  }

  summary.rowsWritten = ops.filter((o) => o.op === "upsert").length;
  summary.rowsDeleted = ops.filter((o) => o.op === "delete").length;
  return { ops, summary };
}

/**
 * Seeds the database from the sub-teams' real planners.
 *
 * Task, workstream and milestone data comes from prisma/seed-data.json, which
 * scripts/import_archive.py extracts from the spreadsheets in archive/. The
 * team structure, the people and the cross-team dependencies are defined here,
 * taken from MarsWorks_Team_Structure_and_Responsibilities.docx.
 *
 * Running this is destructive -- it clears the tables first.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { loadLocalEnv } from "../scripts/load-env";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type ProjectStage,
  type TaskPriority,
  type TaskStatus,
  type TeamView,
} from "../src/generated/prisma";

loadLocalEnv();

// Seeding writes thousands of rows and wants a session-mode connection, the
// same one migrations use, rather than the app's transaction pooler.
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Set DATABASE_URL (and optionally DIRECT_URL) before seeding.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 4 }),
});

/** Host and database only -- the password must never reach a terminal log. */
function describeTarget(url: string): { label: string; port: string } {
  try {
    const u = new URL(url);
    const port = u.port || "5432";
    return { label: `${u.hostname}:${port}${u.pathname}`, port };
  } catch {
    return { label: "unparseable connection string", port: "" };
  }
}

interface ImportedTask {
  team: string;
  workstream?: string | null;
  code?: string | null;
  title: string;
  description?: string | null;
  ownerLabel?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  status?: string | null;
  stage?: string | null;
  priority?: string | null;
  progress?: number;
  notes?: string | null;
  link?: string | null;
  subtasks?: string[];
  source: string;
}

interface SeedData {
  workstreams: { team: string; code: string; name: string }[];
  milestones: { name: string; targetDate: string; description: string | null }[];
  tasks: ImportedTask[];
}

const data: SeedData = JSON.parse(
  readFileSync(path.join(process.cwd(), "prisma", "seed-data.json"), "utf8"),
);

/**
 * The nine teams from the structure document. `defaultView` reflects how each
 * team already works: the ones running date-driven plans open on the timeline,
 * the ones running task flow open on the board. Both render the same rows.
 */
const teams: {
  key: string;
  name: string;
  colour: string;
  defaultView: TeamView;
  description: string;
}[] = [
  // Sub-team colours from the Mission Control palette document. They identify
  // ownership, which is why they are distinct rather than a single family --
  // the chrome around them stays neutral so the Gantt remains readable.
  // Mechanical carries the MarsWorks orange.
  { key: "OPS", name: "Operations", colour: "#8b9aaf", defaultView: "BOARD", description: "Sponsors, emails, communications, procurement, social media, health and safety, and project administration." },
  { key: "MECH", name: "Mechanical", colour: "#f87624", defaultView: "TIMELINE", description: "Chassis, wheels, drivetrain, structure, and mechanical systems." },
  { key: "ELEC", name: "Electronics", colour: "#35b9d6", defaultView: "BOARD", description: "Power, electronics, wiring, and communication between subsystems." },
  { key: "ROBO", name: "Robotics", colour: "#8bcb3f", defaultView: "BOARD", description: "Robot arm and its mechanical, electrical and software integration." },
  { key: "SCI", name: "Science", colour: "#d96baa", defaultView: "TIMELINE", description: "Science kit, experiments, and scientific requirements." },
  { key: "SW", name: "Software", colour: "#9b72e8", defaultView: "BOARD", description: "Software management, manual control, and autonomous navigation." },
];

/** People named in the existing planners. */
const members = [
  { name: "Daniel Parkus", team: "MECH", aliases: ["Daniel"] },
  { name: "Matt", team: "MECH", aliases: [] },
  { name: "Owen", team: "MECH", aliases: [] },
  { name: "Jack", team: "MECH", aliases: [] },
  { name: "Dexi Li", team: "ELEC", aliases: [] },
  { name: "Kai Dolan", team: "ELEC", aliases: [] },
  { name: "Thomas A Haley", team: "ELEC", aliases: ["Thomas", "Tom"] },
  { name: "Harry", team: "ELEC", aliases: ["harry"] },
  { name: "Ali", team: "ELEC", aliases: [] },
];

/**
 * Cross-team dependencies. Each is traceable to a source: either a task title
 * that names the other team outright, or a numbered relationship from section 4
 * of the team-structure document. Matched on a title fragment because the
 * imported rows have no stable identifiers.
 */
const dependencies: {
  from: [string, string];
  to: [string, string];
  lagDays?: number;
  note: string;
}[] = [
  { from: ["MECH", "Update CAD Model"], to: ["SW", "Get Chassis Plans"], note: "Software task title names the dependency outright." },
  { from: ["SW", "Get Chassis Plans"], to: ["SW", "Create URDF Model"], note: "The URDF is built from the chassis plans." },
  { from: ["MECH", "Assemble rover"], to: ["SW", "Get complete chassis"], note: "Software task title names the dependency outright." },
  { from: ["SW", "Get complete chassis"], to: ["SW", "Make new rover model in Gazebo"], note: "Simulation model needs the real chassis geometry." },
  { from: ["ELEC", "ISO CAN Transceiver"], to: ["SW", "Update software/autonomous code"], note: "Structure doc 4: software relies on the electrical system for communication with sensors and motors." },
  { from: ["SW", "Update software/autonomous code"], to: ["MECH", "Software integration"], lagDays: 0, note: "Structure doc 4: Mechanical <-> Software integration." },
  { from: ["MECH", "Manufacture pivot wheels"], to: ["MECH", "Assemble rover"], note: "Cannot assemble before parts exist." },
  { from: ["MECH", "Manufacture hopper"], to: ["MECH", "Assemble rover"], note: "Cannot assemble before parts exist." },
  { from: ["MECH", "Manufacture excavator"], to: ["MECH", "Assemble rover"], note: "Cannot assemble before parts exist." },
  { from: ["MECH", "Final CAD release"], to: ["MECH", "Manufacture pivot wheels"], note: "Manufacture follows CAD release." },
  { from: ["OPS", "Advertise Applications"], to: ["MECH", "Recruitment"], note: "Sub-team recruitment follows the central application round." },
  { from: ["OPS", "Interview Stage"], to: ["SW", "Onboarding"], note: "Onboarding follows interviews." },
  { from: ["OPS", "Prepare Onboarding"], to: ["OPS", "Design Phase"], note: "Teams must be onboarded before the design phase opens." },
];

/**
 * The Mechanical Gantt records percent-complete but no status column, so
 * derive one. An undated row there is a placeholder the team has not planned
 * yet, which is exactly what the backlog is for.
 */
function deriveStatus(task: ImportedTask): TaskStatus {
  if (task.status) return task.status as TaskStatus;
  const progress = task.progress ?? 0;
  if (progress >= 100) return "DONE";
  if (progress > 0) return "IN_PROGRESS";
  return task.plannedStart ? "TODO" : "BACKLOG";
}

function resolveAssignee(
  ownerLabel: string | null | undefined,
  lookup: Map<string, string>,
): string | null {
  if (!ownerLabel) return null;
  // Only a single unambiguous name becomes a real assignee. "Team",
  // "Owen & Jack" and "Sub-Team Leads" stay as free text rather than being
  // silently attributed to one person.
  return lookup.get(ownerLabel.trim().toLowerCase()) ?? null;
}

function findTask(
  tasks: { id: string; teamKey: string; title: string }[],
  [teamKey, fragment]: [string, string],
): string | null {
  const match = tasks.find(
    (t) => t.teamKey === teamKey && t.title.toLowerCase().includes(fragment.toLowerCase()),
  );
  return match?.id ?? null;
}

async function main() {
  const target = describeTarget(connectionString!);
  console.log(
    `Seeding ${target.label} via ${process.env.DIRECT_URL ? "DIRECT_URL" : "DATABASE_URL"}`,
  );
  if (target.port === "6543") {
    console.warn(
      "\n  Warning: port 6543 is Supabase's transaction pooler. Seeding wants a\n" +
        "  session-mode connection. Set DIRECT_URL to the session pooler URI\n" +
        "  (port 5432) in .env if this run fails.\n",
    );
  }

  // The generated client is derived from schema.prisma and is gitignored, so a
  // checkout that has pulled a schema change but not reinstalled still has the
  // old one. Catching that here beats failing halfway through the deletes and
  // leaving the database in a state that looks untouched.
  for (const model of ["workstream", "subtask", "taskDependency"] as const) {
    if (!(model in prisma)) {
      throw new Error(
        `The generated Prisma client has no "${model}" model, so it predates the ` +
          `current schema.\nRun "npm install" (or "npx prisma generate") and seed again.`,
      );
    }
  }

  console.log("Clearing existing data...");
  await prisma.externalLink.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.subtask.deleteMany();
  await prisma.taskLink.deleteMany();
  await prisma.task.deleteMany();
  await prisma.workstream.deleteMany();
  await prisma.member.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.team.deleteMany();

  const teamByKey = new Map<string, string>();
  for (const [index, team] of teams.entries()) {
    const created = await prisma.team.create({
      data: {
        key: team.key,
        name: team.name,
        description: team.description,
        colour: team.colour,
        defaultView: team.defaultView,
        position: index,
      },
    });
    teamByKey.set(team.key, created.id);
  }
  console.log(`Created ${teams.length} sub-teams.`);

  const memberLookup = new Map<string, string>();
  for (const member of members) {
    const created = await prisma.member.create({
      data: { name: member.name, teamId: teamByKey.get(member.team)! },
    });
    for (const alias of [member.name, ...member.aliases]) {
      memberLookup.set(alias.toLowerCase(), created.id);
    }
  }
  console.log(`Created ${members.length} members.`);

  const milestoneByName = new Map<string, string>();
  for (const milestone of data.milestones) {
    if (!milestone.targetDate) continue;
    const created = await prisma.milestone.create({
      data: {
        name: milestone.name,
        description: milestone.description,
        targetDate: new Date(milestone.targetDate),
      },
    });
    milestoneByName.set(milestone.name, created.id);
  }
  console.log(`Created ${milestoneByName.size} milestones.`);

  // Workstreams from the Mechanical WBS, plus one per Electrical project stage
  // so its board groups the same way its spreadsheet did.
  const workstreamKey = (team: string, name: string) => `${team}::${name}`;
  const workstreamIds = new Map<string, string>();
  const declared = [
    ...data.workstreams,
    ...[...new Set(
      data.tasks
        .filter((t) => t.team === "ELEC" && t.workstream)
        .map((t) => t.workstream as string),
    )].map((name) => ({ team: "ELEC", code: null as string | null, name })),
  ];
  for (const [index, ws] of declared.entries()) {
    const created = await prisma.workstream.create({
      data: {
        teamId: teamByKey.get(ws.team)!,
        code: ws.code,
        name: ws.name,
        position: index,
      },
    });
    workstreamIds.set(workstreamKey(ws.team, ws.name), created.id);
  }
  console.log(`Created ${declared.length} workstreams.`);

  const created: { id: string; teamKey: string; title: string }[] = [];
  const counters = new Map<string, number>();
  let order = 0;

  for (const task of data.tasks) {
    const next = (counters.get(task.team) ?? 0) + 1;
    counters.set(task.team, next);
    order += 1000;

    const row = await prisma.task.create({
      data: {
        key: `${task.team}-${next}`,
        title: task.title,
        description: task.description ?? null,
        notes: task.notes ?? null,
        status: deriveStatus(task),
        priority: (task.priority as TaskPriority | undefined) ?? "MEDIUM",
        stage: (task.stage as ProjectStage | null) ?? null,
        progress: task.progress ?? 0,
        boardOrder: order,
        ownerLabel: task.ownerLabel ?? null,
        plannedStart: task.plannedStart ? new Date(task.plannedStart) : null,
        plannedEnd: task.plannedEnd ? new Date(task.plannedEnd) : null,
        teamId: teamByKey.get(task.team)!,
        assigneeId: resolveAssignee(task.ownerLabel, memberLookup),
        workstreamId: task.workstream
          ? workstreamIds.get(workstreamKey(task.team, task.workstream)) ?? null
          : null,
        links: task.link ? { create: [{ label: "Source", url: task.link }] } : undefined,
        subtasks: task.subtasks?.length
          ? {
              create: task.subtasks.map((title, i) => ({
                title,
                position: i,
                done: false,
              })),
            }
          : undefined,
      },
    });
    created.push({ id: row.id, teamKey: task.team, title: task.title });
  }
  console.log(`Created ${created.length} tasks.`);

  let edges = 0;
  const unmatched: string[] = [];
  for (const dep of dependencies) {
    const from = findTask(created, dep.from);
    const to = findTask(created, dep.to);
    if (!from || !to || from === to) {
      unmatched.push(`${dep.from.join(":")} -> ${dep.to.join(":")}`);
      continue;
    }
    await prisma.taskDependency.create({
      data: {
        predecessorId: from,
        successorId: to,
        lagDays: dep.lagDays ?? 0,
        note: dep.note,
      },
    });
    edges += 1;
  }
  console.log(`Created ${edges} dependency edges.`);
  if (unmatched.length) {
    console.warn(`Could not match ${unmatched.length} dependency/ies:`);
    for (const u of unmatched) console.warn(`   ${u}`);
  }

  // Read the result back rather than trusting the writes, and name what is
  // actually in the database now. A seed that reports success while the old
  // rows survive is the failure this whole script exists to rule out.
  const finalTeams = await prisma.team.findMany({ orderBy: { position: "asc" } });
  console.log(`\nSub-teams now in ${target.label}:`);
  for (const team of finalTeams) {
    console.log(`   ${team.position}  ${team.key.padEnd(6)} ${team.name}`);
  }
  if (finalTeams.length !== teams.length) {
    throw new Error(
      `Expected ${teams.length} sub-teams after seeding but found ${finalTeams.length}.`,
    );
  }
  console.log("\nDone. Refresh the site -- no redeploy is needed.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

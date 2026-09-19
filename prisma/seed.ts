/**
 * Representative MarsWorks data: eight sub-teams, five milestones, and a task
 * graph with the kind of cross-team dependencies that make delay impact worth
 * computing. Running this is destructive -- it clears the tables first.
 */
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type TaskPriority, type TaskStatus } from "../src/generated/prisma";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // rely on the ambient environment
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const DAY = 86_400_000;
const today = new Date();
today.setHours(0, 0, 0, 0);
const day = (offset: number) => new Date(today.getTime() + offset * DAY);

const teams = [
  { key: "CHS", name: "Chassis & Structures", colour: "#f97316", description: "Frame, suspension mounts, body panels." },
  { key: "DRV", name: "Drivetrain & Mobility", colour: "#eab308", description: "Wheels, motors, gearboxes, traction control." },
  { key: "ARM", name: "Robotic Arm", colour: "#84cc16", description: "Manipulator, end effector, arm control." },
  { key: "AVI", name: "Avionics & Electronics", colour: "#06b6d4", description: "PCBs, wiring harness, sensors, embedded firmware." },
  { key: "PWR", name: "Power Systems", colour: "#3b82f6", description: "Battery pack, BMS, distribution, charging." },
  { key: "SW", name: "Software & Autonomy", colour: "#8b5cf6", description: "Navigation stack, SLAM, teleop, ground station." },
  { key: "SCI", name: "Science Payload", colour: "#ec4899", description: "Sample collection, onboard assay, instrumentation." },
  { key: "OPS", name: "Integration & Operations", colour: "#64748b", description: "System integration, field testing, competition logistics." },
];

const members = [
  { name: "Amara Okafor", githubLogin: "amara-okafor", team: "CHS" },
  { name: "Ben Larsen", githubLogin: "blarsen", team: "CHS" },
  { name: "Priya Raman", githubLogin: "priyaraman", team: "DRV" },
  { name: "Tomás Herrera", githubLogin: "therrera", team: "DRV" },
  { name: "Yuki Tanaka", githubLogin: "yukit", team: "ARM" },
  { name: "Noor Haddad", githubLogin: "noorhaddad", team: "AVI" },
  { name: "Elena Petrova", githubLogin: "epetrova", team: "AVI" },
  { name: "Sam Whitfield", githubLogin: "samw", team: "PWR" },
  { name: "Kofi Mensah", githubLogin: "kofim", team: "SW" },
  { name: "Lin Zhao", githubLogin: "linzhao", team: "SW" },
  { name: "Dana Kowalski", githubLogin: "dkowalski", team: "SCI" },
  { name: "Rafael Costa", githubLogin: "rcosta", team: "OPS" },
  { name: "Ingrid Møller", githubLogin: "imoller", team: "OPS" },
];

const milestones = [
  { key: "freeze", name: "Design Freeze", targetDate: day(21), description: "All sub-system designs locked; no further geometry changes." },
  { key: "cdr", name: "Critical Design Review", targetDate: day(42), description: "Full design review with faculty advisors." },
  { key: "integration", name: "Prototype Integration", targetDate: day(77), description: "First full-rover assembly and power-on." },
  { key: "trial", name: "Field Trial", targetDate: day(112), description: "Two-day desert analogue test." },
  { key: "comp", name: "Competition", targetDate: day(147), description: "University Rover Challenge." },
];

interface SeedTask {
  key: string;
  title: string;
  description: string;
  team: string;
  status: TaskStatus;
  priority: TaskPriority;
  estimateDays: number;
  progress: number;
  assignee?: string;
  milestone?: string;
  earliestStart?: Date;
  links?: { label: string; url: string }[];
}

const tasks: SeedTask[] = [
  // Chassis
  { key: "CHS-1", title: "Frame topology optimisation", description: "Run FEA on three candidate frame layouts and pick the best stiffness-to-mass ratio. Target under 11 kg for the bare frame.", team: "CHS", status: "DONE", priority: "HIGH", estimateDays: 8, progress: 100, assignee: "amara-okafor", milestone: "freeze", links: [{ label: "FEA results (Drive)", url: "https://drive.google.com/marsworks-fea" }] },
  { key: "CHS-2", title: "Finalise chassis CAD", description: "Consolidate the frame, suspension mounts and payload bay into a single assembly and release drawings for machining.", team: "CHS", status: "IN_PROGRESS", priority: "CRITICAL", estimateDays: 10, progress: 60, assignee: "amara-okafor", milestone: "freeze", links: [{ label: "Onshape assembly", url: "https://cad.onshape.com/marsworks-chassis" }] },
  { key: "CHS-3", title: "Machine frame members", description: "Send the released drawings to the student workshop. Two-week queue, so the drawings must land before the design freeze.", team: "CHS", status: "TODO", priority: "CRITICAL", estimateDays: 14, progress: 0, assignee: "blarsen", milestone: "integration" },
  { key: "CHS-4", title: "Weld and align frame", description: "Jig-weld the machined members and verify squareness to within 1 mm across the wheelbase.", team: "CHS", status: "BACKLOG", priority: "HIGH", estimateDays: 6, progress: 0, assignee: "blarsen", milestone: "integration" },
  { key: "CHS-5", title: "Body panel fabrication", description: "Vacuum-form the dust shields. Non-critical for the field trial but needed for competition scoring.", team: "CHS", status: "BACKLOG", priority: "LOW", estimateDays: 5, progress: 0, milestone: "comp" },

  // Drivetrain
  { key: "DRV-1", title: "Motor and gearbox selection", description: "Size the drive motors against the 18 degree slope requirement with a 2x safety margin on stall torque.", team: "DRV", status: "DONE", priority: "HIGH", estimateDays: 6, progress: 100, assignee: "priyaraman", milestone: "freeze" },
  { key: "DRV-2", title: "Suspension geometry sign-off", description: "Rocker-bogie link lengths and pivot positions. Blocks the chassis team's mount locations.", team: "DRV", status: "IN_PROGRESS", priority: "CRITICAL", estimateDays: 7, progress: 70, assignee: "priyaraman", milestone: "freeze" },
  { key: "DRV-3", title: "Wheel tread prototype and soil testing", description: "Print three tread patterns and test drawbar pull in the sand pit.", team: "DRV", status: "IN_PROGRESS", priority: "MEDIUM", estimateDays: 9, progress: 30, assignee: "therrera", milestone: "cdr" },
  { key: "DRV-4", title: "Assemble drive pods", description: "Build all six wheel pods: motor, gearbox, encoder, bearing block.", team: "DRV", status: "TODO", priority: "HIGH", estimateDays: 12, progress: 0, assignee: "therrera", milestone: "integration" },
  { key: "DRV-5", title: "Drivetrain bench test", description: "Run each pod on the bench for two hours at rated load and log temperatures.", team: "DRV", status: "BACKLOG", priority: "MEDIUM", estimateDays: 4, progress: 0, milestone: "integration" },

  // Robotic arm
  { key: "ARM-1", title: "Arm kinematic design", description: "Five-DOF arm reaching the 0.5 m equipment-servicing envelope from a parked rover.", team: "ARM", status: "DONE", priority: "HIGH", estimateDays: 9, progress: 100, assignee: "yukit", milestone: "freeze" },
  { key: "ARM-2", title: "End effector design and print", description: "Parallel gripper sized for the competition's cache tube and the toggle switches on the equipment panel.", team: "ARM", status: "IN_PROGRESS", priority: "HIGH", estimateDays: 8, progress: 45, assignee: "yukit", milestone: "cdr" },
  { key: "ARM-3", title: "Arm harness and slip ring integration", description: "Route power and CAN through the shoulder without fouling the full rotation range.", team: "ARM", status: "BLOCKED", priority: "HIGH", estimateDays: 5, progress: 0, milestone: "integration" },
  { key: "ARM-4", title: "Inverse kinematics solver", description: "Closed-form IK for the five-DOF arm with joint limit handling, exposed over the ROS action interface.", team: "ARM", status: "TODO", priority: "MEDIUM", estimateDays: 10, progress: 0, milestone: "trial" },

  // Avionics
  { key: "AVI-1", title: "Main distribution board schematic", description: "Fused rails for motors, compute, comms and payload with per-rail current sense.", team: "AVI", status: "DONE", priority: "CRITICAL", estimateDays: 7, progress: 100, assignee: "noorhaddad", milestone: "freeze", links: [{ label: "KiCad repo", url: "https://github.com/marsworks/avionics" }] },
  { key: "AVI-2", title: "PCB layout and fabrication order", description: "Four-layer board. The fab house quotes 15 working days including shipping, so this cannot slip.", team: "AVI", status: "IN_PROGRESS", priority: "CRITICAL", estimateDays: 6, progress: 50, assignee: "noorhaddad", milestone: "cdr" },
  { key: "AVI-3", title: "Board bring-up and rail validation", description: "Power up incrementally on the bench supply, check every rail under load before anything expensive is attached.", team: "AVI", status: "BACKLOG", priority: "CRITICAL", estimateDays: 4, progress: 0, assignee: "epetrova", milestone: "integration" },
  { key: "AVI-4", title: "Wiring harness build", description: "Full rover harness with labelled connectors and a documented pinout.", team: "AVI", status: "BACKLOG", priority: "HIGH", estimateDays: 8, progress: 0, assignee: "epetrova", milestone: "integration" },
  { key: "AVI-5", title: "Motor controller firmware", description: "CAN-addressable closed-loop velocity control with a watchdog-driven failsafe stop.", team: "AVI", status: "IN_PROGRESS", priority: "HIGH", estimateDays: 11, progress: 25, assignee: "epetrova", milestone: "trial" },

  // Power
  { key: "PWR-1", title: "Battery pack sizing", description: "Size the pack for a 90 minute mission with 30% reserve, within the competition's energy limit.", team: "PWR", status: "DONE", priority: "HIGH", estimateDays: 4, progress: 100, assignee: "samw", milestone: "freeze" },
  { key: "PWR-2", title: "Pack assembly and BMS configuration", description: "Spot-weld the cells, fit the BMS, and verify balancing across a full charge cycle.", team: "PWR", status: "TODO", priority: "CRITICAL", estimateDays: 9, progress: 0, assignee: "samw", milestone: "integration" },
  { key: "PWR-3", title: "Safety review and enclosure", description: "Fire-resistant enclosure, accessible disconnect, and the documentation the competition safety inspection requires.", team: "PWR", status: "BACKLOG", priority: "CRITICAL", estimateDays: 5, progress: 0, milestone: "trial" },

  // Software
  { key: "SW-1", title: "ROS 2 workspace and CI", description: "Repository layout, colcon build, and a GitHub Actions job that builds and runs the unit tests on every PR.", team: "SW", status: "DONE", priority: "MEDIUM", estimateDays: 5, progress: 100, assignee: "kofim", links: [{ label: "CI workflow", url: "https://github.com/marsworks/rover-software/actions" }] },
  { key: "SW-2", title: "Teleoperation and ground station UI", description: "Latency-tolerant driving interface with camera feeds, battery telemetry and an emergency stop.", team: "SW", status: "IN_PROGRESS", priority: "HIGH", estimateDays: 14, progress: 40, assignee: "kofim", milestone: "integration" },
  { key: "SW-3", title: "SLAM and local costmap", description: "Stereo-driven mapping good enough for obstacle avoidance at 1 m/s.", team: "SW", status: "IN_PROGRESS", priority: "HIGH", estimateDays: 18, progress: 20, assignee: "linzhao", milestone: "trial" },
  { key: "SW-4", title: "Autonomous waypoint navigation", description: "Drive to a GNSS waypoint and search for the marker, handling recovery when the path is blocked.", team: "SW", status: "BACKLOG", priority: "CRITICAL", estimateDays: 16, progress: 0, assignee: "linzhao", milestone: "trial" },
  { key: "SW-5", title: "Hardware-in-the-loop test rig", description: "Run the full stack against the real motor controllers on the bench so software is not blocked by the rover build.", team: "SW", status: "TODO", priority: "MEDIUM", estimateDays: 6, progress: 0, milestone: "integration" },

  // Science
  { key: "SCI-1", title: "Sample collection mechanism design", description: "Auger-based collector delivering 5 g of subsurface soil to the onboard carousel.", team: "SCI", status: "IN_PROGRESS", priority: "HIGH", estimateDays: 10, progress: 55, assignee: "dkowalski", milestone: "cdr" },
  { key: "SCI-2", title: "Onboard assay bench", description: "Reagent-based test for organic markers, plus the camera and lighting for the panel imaging task.", team: "SCI", status: "TODO", priority: "MEDIUM", estimateDays: 12, progress: 0, assignee: "dkowalski", milestone: "trial" },
  { key: "SCI-3", title: "Science operations procedure", description: "Written procedure and data-recording template for the science mission run.", team: "SCI", status: "BACKLOG", priority: "LOW", estimateDays: 4, progress: 0, milestone: "comp" },

  // Operations
  { key: "OPS-1", title: "Integration plan and interface control document", description: "Who bolts what to what, in which order, with the mechanical and electrical interfaces pinned down.", team: "OPS", status: "IN_PROGRESS", priority: "CRITICAL", estimateDays: 6, progress: 65, assignee: "rcosta", milestone: "cdr" },
  { key: "OPS-2", title: "Full rover integration", description: "Assemble every sub-system onto the welded frame and complete a supervised power-on.", team: "OPS", status: "BACKLOG", priority: "CRITICAL", estimateDays: 8, progress: 0, assignee: "rcosta", milestone: "integration" },
  { key: "OPS-3", title: "Field trial logistics", description: "Transport, site permit, spares kit and the test card for the two-day analogue run.", team: "OPS", status: "TODO", priority: "HIGH", estimateDays: 5, progress: 10, assignee: "imoller", milestone: "trial" },
  { key: "OPS-4", title: "Field trial execution", description: "Run the full mission profile in the field and log every failure for the competition readiness review.", team: "OPS", status: "BACKLOG", priority: "CRITICAL", estimateDays: 3, progress: 0, assignee: "rcosta", milestone: "trial" },
  { key: "OPS-5", title: "Competition documentation package", description: "System acceptance review document, budget and safety case, due three weeks before competition.", team: "OPS", status: "BACKLOG", priority: "HIGH", estimateDays: 7, progress: 0, assignee: "imoller", milestone: "comp" },
];

/** predecessor -> successor, with optional lag for procurement or shipping. */
const dependencies: { from: string; to: string; lagDays?: number; note?: string }[] = [
  { from: "DRV-2", to: "CHS-2", note: "Suspension pivot positions drive the chassis mount geometry." },
  { from: "CHS-2", to: "CHS-3", lagDays: 3, note: "Workshop queue after drawings are released." },
  { from: "CHS-3", to: "CHS-4" },
  { from: "CHS-4", to: "OPS-2", note: "Nothing mounts until the frame is welded and aligned." },
  { from: "DRV-1", to: "DRV-4" },
  { from: "CHS-3", to: "DRV-4", note: "Wheel pods bolt to the machined uprights." },
  { from: "DRV-4", to: "DRV-5" },
  { from: "DRV-5", to: "OPS-2" },
  { from: "ARM-1", to: "ARM-2" },
  { from: "ARM-2", to: "ARM-3" },
  { from: "AVI-4", to: "ARM-3", note: "Arm harness branches off the main loom." },
  { from: "ARM-3", to: "OPS-2" },
  { from: "ARM-2", to: "ARM-4" },
  { from: "AVI-1", to: "AVI-2" },
  { from: "AVI-2", to: "AVI-3", lagDays: 15, note: "PCB fabrication and shipping lead time." },
  { from: "AVI-3", to: "AVI-4" },
  { from: "AVI-3", to: "AVI-5" },
  { from: "AVI-4", to: "OPS-2" },
  { from: "PWR-1", to: "PWR-2" },
  { from: "AVI-3", to: "PWR-2", note: "Pack is not connected until the rails are validated." },
  { from: "PWR-2", to: "PWR-3" },
  { from: "PWR-2", to: "OPS-2" },
  { from: "SW-1", to: "SW-2" },
  { from: "SW-1", to: "SW-3" },
  { from: "AVI-5", to: "SW-5", note: "HIL rig needs real motor controller firmware." },
  { from: "SW-3", to: "SW-4" },
  { from: "SW-5", to: "SW-4" },
  { from: "SCI-1", to: "SCI-2" },
  { from: "SCI-2", to: "OPS-2" },
  { from: "OPS-1", to: "OPS-2" },
  { from: "OPS-2", to: "OPS-3" },
  { from: "OPS-3", to: "OPS-4" },
  { from: "SW-4", to: "OPS-4", note: "Autonomy must be flyable before the field trial is worth running." },
  { from: "SW-2", to: "OPS-4" },
  { from: "OPS-4", to: "OPS-5" },
  { from: "SCI-3", to: "OPS-5" },
];

async function main() {
  console.log("Clearing existing data...");
  await prisma.externalLink.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.taskLink.deleteMany();
  await prisma.task.deleteMany();
  await prisma.member.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.team.deleteMany();

  const teamByKey = new Map<string, string>();
  for (const [index, team] of teams.entries()) {
    const created = await prisma.team.create({ data: { ...team, position: index } });
    teamByKey.set(team.key, created.id);
  }
  console.log(`Created ${teams.length} sub-teams.`);

  const memberByLogin = new Map<string, string>();
  for (const member of members) {
    const created = await prisma.member.create({
      data: {
        name: member.name,
        githubLogin: member.githubLogin,
        email: `${member.githubLogin}@marsworks.example`,
        teamId: teamByKey.get(member.team)!,
      },
    });
    memberByLogin.set(member.githubLogin, created.id);
  }
  console.log(`Created ${members.length} members.`);

  const milestoneByKey = new Map<string, string>();
  for (const milestone of milestones) {
    const created = await prisma.milestone.create({
      data: {
        name: milestone.name,
        description: milestone.description,
        targetDate: milestone.targetDate,
      },
    });
    milestoneByKey.set(milestone.key, created.id);
  }
  console.log(`Created ${milestones.length} milestones.`);

  const taskByKey = new Map<string, string>();
  const orderByStatus = new Map<string, number>();
  for (const task of tasks) {
    const nextOrder = (orderByStatus.get(task.status) ?? 0) + 1000;
    orderByStatus.set(task.status, nextOrder);
    const created = await prisma.task.create({
      data: {
        key: task.key,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        estimateDays: task.estimateDays,
        progress: task.progress,
        boardOrder: nextOrder,
        earliestStart: task.earliestStart,
        teamId: teamByKey.get(task.team)!,
        assigneeId: task.assignee ? memberByLogin.get(task.assignee)! : null,
        milestoneId: task.milestone ? milestoneByKey.get(task.milestone)! : null,
        links: task.links ? { create: task.links } : undefined,
      },
    });
    taskByKey.set(task.key, created.id);
  }
  console.log(`Created ${tasks.length} tasks.`);

  for (const dep of dependencies) {
    await prisma.taskDependency.create({
      data: {
        predecessorId: taskByKey.get(dep.from)!,
        successorId: taskByKey.get(dep.to)!,
        lagDays: dep.lagDays ?? 0,
        note: dep.note,
      },
    });
  }
  console.log(`Created ${dependencies.length} dependency edges.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

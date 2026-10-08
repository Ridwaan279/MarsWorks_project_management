/**
 * The MarsWorks sub-teams. Read by the seed, and by
 * scripts/ensure-sub-teams.ts, which adds any of these a live database is
 * missing on each production deploy -- so adding a sub-team is a change to
 * this list, with no SQL to run by hand.
 *
 * `key` prefixes the sub-team's task keys (SW-4) and links it to its tab in
 * the Google Sheet (src/lib/sheets/schema.ts). It cannot be changed once tasks
 * exist. `defaultView` reflects how each team already works: the ones running
 * date-driven plans open on the timeline, the ones running task flow open on
 * the board. Both render the same rows.
 *
 * Colours identify ownership, which is why they are distinct rather than a
 * single family -- the chrome around them stays neutral so the Gantt remains
 * readable. Mechanical carries the MarsWorks orange. Drone and Mini-Rover,
 * added later, were picked to sit as far as the wheel allows from the six
 * before them (OKLab distance, checked under simulated colour blindness too)
 * and from the danger and warning colours.
 */
import type { TeamView } from "../src/generated/prisma";

export interface SubTeamDefinition {
  key: string;
  name: string;
  colour: string;
  defaultView: TeamView;
  description: string;
}

export const SUB_TEAMS: SubTeamDefinition[] = [
  { key: "OPS", name: "Operations", colour: "#8b9aaf", defaultView: "BOARD", description: "Sponsors, emails, communications, procurement, social media, health and safety, and project administration." },
  { key: "MECH", name: "Mechanical", colour: "#f87624", defaultView: "TIMELINE", description: "Chassis, wheels, drivetrain, structure, and mechanical systems." },
  { key: "ELEC", name: "Electronics", colour: "#35b9d6", defaultView: "BOARD", description: "Power, electronics, wiring, and communication between subsystems." },
  { key: "ROBO", name: "Robotics", colour: "#8bcb3f", defaultView: "BOARD", description: "Robot arm and its mechanical, electrical and software integration." },
  { key: "SCI", name: "Science", colour: "#d96baa", defaultView: "TIMELINE", description: "Science kit, experiments, and scientific requirements." },
  { key: "SW", name: "Software", colour: "#9b72e8", defaultView: "BOARD", description: "Software management, manual control, and autonomous navigation." },
  { key: "DRONE", name: "Drone", colour: "#1da56c", defaultView: "BOARD", description: "The drone project." },
  { key: "MINI", name: "Mini-Rover", colour: "#985d8d", defaultView: "BOARD", description: "The mini-rover project." },
];

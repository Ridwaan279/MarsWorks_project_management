/**
 * The MarsWorks team members, from the 2026/27 team list. Read by the seed,
 * and by scripts/ensure-roster.ts, which on each production deploy adds anyone
 * here the database is missing -- so a new member is a line in this list.
 *
 * Only what the site uses is kept: a name, a sub-team and a role. Roles
 * decide what someone may do (only leads and technical advisors can delete
 * tasks), and each deploy sets them from here. Emails are never kept here --
 * this repository is public -- but in the database, where signing in looks
 * them up; see docs/sign-in.md.
 *
 * `aliases` are other names the same person appears under in the old
 * planners. The seed uses them to link imported tasks, and the roster step
 * uses them to give an existing short-named member ("Matt") their full name
 * rather than adding them a second time, so their tasks stay theirs.
 */
import type { MemberRole } from "../src/generated/prisma";

export interface MemberDefinition {
  name: string;
  /** Sub-team key, as in prisma/sub-teams.ts. */
  team: string;
  /** From the team list's Role column; Team Member when left out. */
  role?: MemberRole;
  aliases?: string[];
}

export const MEMBERS: MemberDefinition[] = [
  // Operations
  { name: "Adam Binmore", team: "OPS", role: "PROJECT_LEAD" },
  { name: "Amir J Berkowitz", team: "OPS" },
  { name: "Blaise Glennon", team: "OPS" },
  { name: "Elouise Wilkes", team: "OPS", role: "PROJECT_LEAD" },
  { name: "Hannah Major", team: "OPS" },
  { name: "Ibrahim Samaah", team: "OPS" },
  { name: "Katie Mason", team: "OPS", role: "TEAM_LEAD" },
  { name: "Kosisochukwu Daniella Ngonadi", team: "OPS" },
  { name: "Ridwaan Joomun", team: "OPS", role: "PROJECT_LEAD" },
  { name: "Soong Seng Hee", team: "OPS", role: "TECHNICAL_ADVISOR" },

  // Mechanical
  { name: "Alan Umesh", team: "MECH" },
  { name: "Daniel Parkus", team: "MECH", role: "TEAM_LEAD", aliases: ["Daniel"] },
  { name: "Ixie Akpan", team: "MECH" },
  { name: "Jack Sutton", team: "MECH", aliases: ["Jack"] },
  { name: "John Straughn", team: "MECH" },
  { name: "Kevin Holmshaw", team: "MECH" },
  { name: "Matt Shepherd", team: "MECH", role: "TECHNICAL_ADVISOR", aliases: ["Matt"] },
  { name: "Matthew Garton-Pope", team: "MECH" },
  { name: "Morris Wong", team: "MECH" },
  { name: "Owen Griffiths", team: "MECH", aliases: ["Owen"] },
  { name: "Yusuf Rahim", team: "MECH" },

  // Electronics
  { name: "Ahmed Othman OM Sayed", team: "ELEC" },
  { name: "Ali Ahmad", team: "ELEC", aliases: ["Ali"] },
  { name: "Alya Su Alkan", team: "ELEC" },
  { name: "Benjamin Gostelow", team: "ELEC" },
  { name: "Dexi Li", team: "ELEC", role: "TECHNICAL_ADVISOR" },
  { name: "Harry Geofrey Haines", team: "ELEC", aliases: ["Harry"] },
  { name: "Kai Dolan", team: "ELEC", role: "TEAM_LEAD" },
  { name: "Karim El-Kheater", team: "ELEC" },
  { name: "Susan D Blake", team: "ELEC" },
  { name: "Thomas Haley", team: "ELEC", aliases: ["Thomas A Haley", "Thomas", "Tom"] },

  // Robotics
  { name: "Arjun Pandit", team: "ROBO" },
  { name: "Ben Cole", team: "ROBO", role: "TEAM_LEAD" },
  { name: "Chi Nguyen", team: "ROBO" },
  { name: "Finlay Budd", team: "ROBO" },
  { name: "Jacob Chapman", team: "ROBO" },
  { name: "Kee Yee Yang", team: "ROBO" },
  { name: "Luke F Burden", team: "ROBO" },
  { name: "Maninee Bambole", team: "ROBO", role: "TEAM_LEAD" },
  { name: "Munir Danladi Isa Osori", team: "ROBO" },
  { name: "Reuben Crouwel-Welburn", team: "ROBO" },
  { name: "Teejhan Hansraj", team: "ROBO" },

  // Science
  { name: "Emily Buck", team: "SCI" },
  { name: "Maira Kapoor", team: "SCI" },
  { name: "Mia Kininmonth", team: "SCI" },
  { name: "Nathan Jones", team: "SCI" },
  { name: "Noah Mathew", team: "SCI", role: "TEAM_LEAD" },
  { name: "Ranudi Rathnasekara", team: "SCI" },
  { name: "Yaseen Shaikh", team: "SCI" },

  // Software
  { name: "Adam MSA Reda", team: "SW" },
  { name: "Golibe A Nwobi", team: "SW" },
  { name: "Jack Hamer", team: "SW", role: "TECHNICAL_ADVISOR" },
  { name: "Keaton Docherty", team: "SW" },
  { name: "Khizar A Khan", team: "SW" },
  { name: "Kyaw Zawe Lin", team: "SW" },
  { name: "Luke Crowley", team: "SW" },
  { name: "Nheeru Tumber", team: "SW", role: "TEAM_LEAD" },
  { name: "Shadab Mir", team: "SW" },
  { name: "Yanki Kirlikova", team: "SW" },

  // Drone
  { name: "Aaditya K Siripal", team: "DRONE" },
  { name: "Ifan L Tweed", team: "DRONE" },
  { name: "James JK Morris", team: "DRONE" },
  { name: "Morgan J Sewell", team: "DRONE" },
  { name: "Sulton Tangribergenov", team: "DRONE" },
];

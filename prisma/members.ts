/**
 * The MarsWorks team members, from the 2026/27 team list. Read by the seed,
 * and by scripts/ensure-roster.ts, which on each production deploy adds anyone
 * here the database is missing -- so a new member is a line in this list.
 *
 * Only what the site uses is kept: a name and a sub-team. Emails and access
 * records stay in the team list itself.
 *
 * `aliases` are other names the same person appears under in the old
 * planners. The seed uses them to link imported tasks, and the roster step
 * uses them to give an existing short-named member ("Matt") their full name
 * rather than adding them a second time, so their tasks stay theirs.
 */
export interface MemberDefinition {
  name: string;
  /** Sub-team key, as in prisma/sub-teams.ts. */
  team: string;
  aliases?: string[];
}

export const MEMBERS: MemberDefinition[] = [
  // Operations
  { name: "Adam Binmore", team: "OPS" },
  { name: "Elouise Wilkes", team: "OPS" },
  { name: "Katie Mason", team: "OPS" },
  { name: "Ridwaan Joomun", team: "OPS" },
  { name: "Soong Seng Hee", team: "OPS" },

  // Mechanical
  { name: "Daniel Parkus", team: "MECH", aliases: ["Daniel"] },
  { name: "Jack Sutton", team: "MECH", aliases: ["Jack"] },
  { name: "John Straughn", team: "MECH" },
  { name: "Matt Shepherd", team: "MECH", aliases: ["Matt"] },
  { name: "Owen Griffiths", team: "MECH", aliases: ["Owen"] },
  { name: "Yusuf Rahim", team: "MECH" },

  // Electronics
  { name: "Ali Ahmad", team: "ELEC", aliases: ["Ali"] },
  { name: "Dexi Li", team: "ELEC" },
  { name: "Harry Geofrey Haines", team: "ELEC", aliases: ["Harry"] },
  { name: "Kai Dolan", team: "ELEC" },
  { name: "Karim El-Kheater", team: "ELEC" },
  { name: "Thomas Haley", team: "ELEC", aliases: ["Thomas A Haley", "Thomas", "Tom"] },

  // Robotics
  { name: "Ben Cole", team: "ROBO" },
  { name: "Chi Nguyen", team: "ROBO" },
  { name: "Finlay Budd", team: "ROBO" },
  { name: "Kee Yee Yang", team: "ROBO" },
  { name: "Manasi Barge", team: "ROBO" },
  { name: "Maninee Bambole", team: "ROBO" },
  { name: "Reuben Crouwel-Welburn", team: "ROBO" },

  // Science
  { name: "Emily Buck", team: "SCI" },
  { name: "Maira Kapoor", team: "SCI" },
  { name: "Mia Kininmonth", team: "SCI" },
  { name: "Nathan Jones", team: "SCI" },
  { name: "Noah Mathew", team: "SCI" },
  { name: "Ranudi Rathnasekara", team: "SCI" },
  { name: "Yaseen Shaikh", team: "SCI" },

  // Software
  { name: "Jack Hamer", team: "SW" },
  { name: "Keaton Docherty", team: "SW" },
  { name: "Nheeru Tumber", team: "SW" },
  { name: "Shadab Mir", team: "SW" },
  { name: "Yanki Kirlikova", team: "SW" },
];

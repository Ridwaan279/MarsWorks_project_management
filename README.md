# MarsWorks Mission Control

One place to see what all eight MarsWorks sub-teams are doing, how they depend
on each other, and what a delay in one of them does to the rest.

It is deliberately **not** a Jira clone. It does four things:

- **Board** — a drag-and-drop Kanban across every sub-team, with task detail,
  assignment and links.
- **Timeline** — a Gantt view grouped by sub-team, with milestone markers and
  the critical path highlighted.
- **Overview** — one page that answers "is each sub-team on track?".
- **Impact** — "if this task slips ten days, which other sub-teams and
  milestones move?"

## The agreed way of working

Six sub-teams arrived here with four different planning methods. Rather than
force everyone onto one, the tool defines a **shared spine** every team must
fill in, and then renders it two ways.

**The spine — required on every task:**

| Field | Why it is required |
| --- | --- |
| Workstream | Grouping, from Mechanical's WBS. Eight teams of flat tasks is unreadable. |
| Owner | Who is actually doing it. Free text is allowed (`Owen & Jack`, `Team`). |
| Planned start + end | **The one that matters.** An undated task cannot be forecast, cannot be late, and cannot warn anyone downstream. |
| Status | Where it is in the flow. |
| % complete | How far through it is. |
| Stage | Engineering lifecycle phase, from Electrical's tracker. |
| Dependencies | On anything another sub-team is waiting for. |

**Two views over that same data**, picked per team via `Team.defaultView`:

- **Timeline** — Mechanical and Science. Date-driven, WBS-grouped, the way the
  Mechanical Gantt already works.
- **Board** — Electronics, Software, Robotics and Operations. Kanban flow, the
  way the Electronics dashboard and the Robotics Jira board already work.

The six sub-teams are those named in
`MarsWorks_Team_Structure_and_Responsibilities.docx`: Operations, Mechanical,
Electronics, Robotics, Science and Software. The master timeline also carries a
"Leadership and Milestones" tab; its milestone rows become milestones, and its
remaining recruitment and administration rows belong to Operations. Its Drone
and Mini-Rover tabs hold no tasks and no sub-team owns them, so they are not
imported.

Nobody has to change how they think. The board and the Gantt are two renderings
of one table, so a Kanban team's cards still appear on everyone else's timeline.

**Why the lifecycle stage is project-wide.** It comes from Electronics, and it
is the only one of the four methods with an explicit `Order` phase. Procurement
lead time is the largest single source of slip on a hardware project, and no
other sub-team was tracking it at all.

### Where the data came from

`archive/` holds the planners this replaces. `scripts/import_archive.py` reads
them and writes `prisma/seed-data.json`:

| Source | Contributed |
| --- | --- |
| `Master Timeline ... .xlsx` | Operations and Software tasks, and the five project milestones |
| `Mechanical_Gantt chart.xlsx` | The WBS workstreams and 37 Mechanical tasks |
| `Electrical Project Dashboard.xlsx` | 11 Electronics tasks with lifecycle stages and checklist sub-tasks |
| `MarsWorks_Team_Structure_....docx` | The six sub-teams and the cross-team dependency map |

That importer is a one-off migration tool, but the **column mapping it encodes
is the mapping the Google Sheets sync has to agree with**, which is why it is
kept rather than thrown away.

## Architecture

The Postgres database is the **single source of truth**. GitHub Projects and
Google Sheets are planned as *synchronised surfaces* that read from and write
back to it — teams keep using the tool they already like, but the canonical
record lives here where it has referential integrity, change attribution and
conflict handling. The `ExternalLink` table is the mapping layer that sync will
use; `contentHash` exists so the webhook echo of our own write can be
recognised and dropped instead of looping forever.

```
src/lib/schedule.ts   Critical-path engine. Pure functions, no DB, no clock.
src/lib/project.ts    Loads a project snapshot and runs it through the engine.
src/lib/db.ts         Prisma client (Postgres via the pg driver adapter).
src/app/              Next.js App Router pages and API routes.
src/components/       Board, timeline, drawer, impact simulator.
prisma/schema.prisma  Canonical schema.
prisma/seed.ts        Eight sub-teams of representative data.
```

### How the scheduling works

Forward pass, then backward pass, over the task dependency graph:

- A task can start on the later of today, its own earliest-start constraint,
  and every predecessor's finish plus any lag.
- A task must finish by the earliest of its successors' latest starts, or by
  its milestone's target date if it feeds one.
- The gap between the two is **float** (slack). Zero or negative float means
  the task is on the critical path — any slip there moves the whole project.

Durations are **calendar days**, not working days. A student team does not work
a predictable five-day week, so pretending otherwise would add machinery
without adding accuracy.

The impact simulator runs the same engine twice — once as-is, once with extra
days on one task — and diffs the result, so the numbers it reports always agree
with what the timeline shows.

## Running it locally

Requires Node 22+ and a Postgres database.

```bash
npm install                   # also generates the Prisma client (postinstall)
cp .env.example .env          # point DATABASE_URL at your database
npx prisma db push            # create the tables
npm run db:seed               # load representative data (DESTRUCTIVE: wipes tables)
npm run dev                   # http://localhost:3000
```

The Prisma client is generated code under `src/generated/`, which is gitignored
and therefore absent on a fresh clone. `npm install` generates it via the
`postinstall` script. If you ever see:

```
Error: Cannot find module '../src/generated/prisma'
```

the client has not been generated yet -- run `npx prisma generate`. Note that
in Prisma 7 `prisma db push` does *not* generate the client, unlike Prisma 6.

### If `.env` seems to be ignored

`Error: Set DATABASE_URL ... before seeding` on a `.env` that plainly contains
it is nearly always the file's encoding. Notepad and PowerShell redirection
save UTF-16 or prepend a byte-order mark, and Node's own `process.loadEnvFile`
reads such a file without complaint and loads nothing from it. The loader in
`scripts/load-env.ts` decodes UTF-8, UTF-8 with a BOM, and UTF-16 in either
byte order, and throws with an explanation when a file cannot be read at all.

To write the file from PowerShell without corrupting it:

```powershell
Set-Content -Path .env -Encoding utf8 -Value 'DATABASE_URL="..."'
Add-Content -Path .env -Encoding utf8 -Value 'DIRECT_URL="..."'
```

Other commands:

```bash
npm test          # scheduler unit tests
npm run typecheck
npm run build
npm run db:studio # browse the data
```

## Deploying

**Database — Supabase.** Two connection strings, from *Project Settings →
Database → Connection string*:

| Variable | Pooler | Port | Used by |
| --- | --- | --- | --- |
| `DATABASE_URL` | Transaction | 6543 | The application. Built for serverless, where every concurrent instance opens its own pool. |
| `DIRECT_URL` | Session | 5432 | `prisma db push` and `npm run db:seed` only. DDL and Prisma's advisory locks do not survive a transaction pooler. |

`DIRECT_URL` is only needed where you run migrations, normally your own
machine; it does not need to be set on Vercel. Do not use Supabase's *direct*
connection for either: it is IPv6-only and unreachable from Vercel.

Session mode allows 15 clients for the whole project, so pointing the
application at it exhausts the pool and locks everything else out with
`max clients reached in session mode`. `DATABASE_POOL_MAX` caps how many
connections one process may hold (3 on Vercel, 5 locally).

**App — Vercel.** Import the repository, add `DATABASE_URL` as an environment
variable, and deploy. `npm run build` runs `prisma generate` first, so no extra
build configuration is needed.

Run `npx prisma db push` against the production database once before the first
deploy.

## Changing the sub-teams on a database that already has data

Sub-teams are rows, not code, so redeploying does not change them. On a
database that was seeded before the sub-teams were corrected, either:

- run `npm install && npm run db:seed` again, which is simplest but **clears
  every table**, so only do it while the data is still the imported archive.
  The install matters: the generated Prisma client is gitignored, so a
  checkout that pulled a schema change without reinstalling still has the old
  one and the seed fails partway through. Seeding also wants `DIRECT_URL`
  (session pooler, port 5432) rather than the transaction pooler; or
- run `scripts/fix-subteams.sql` in the Supabase SQL editor, which renames
  Electrical to Electronics, moves the Executive team's work and people to
  Operations, renumbers its task keys, removes the teams that are not
  sub-teams and reorders the rest. It touches nothing else and is safe to run
  twice.

## Known limitations

- **No authentication yet.** Anyone with the URL can edit. GitHub OAuth is the
  intended fix — everyone on the team already has an account, and it doubles as
  the credential for the GitHub Projects sync.
- **Completed tasks have no history.** The schema records estimates and
  progress but not actual start and finish dates, so a done task is drawn at
  today rather than where it really happened. Adding `startedAt`/`completedAt`
  is the fix, and is a prerequisite for any velocity reporting.
- **Dependencies are created in the database, not the UI.** The seed builds the
  graph from the structure document; there is no screen for adding an edge yet.
  This is the next thing to build -- the cross-team edges are the highest-value
  data in the system.
- **No task is linked to a milestone yet.** The imported planners did not
  connect their work to the project's dated checkpoints, so every milestone
  reports "no work linked" rather than a forecast. Sub-team leads need to make
  those links before milestone forecasting means anything.
- **Undated tasks are drawn at today** on the timeline, because there is
  nothing else to draw them at. They are flagged as undated on the board and
  counted in the coverage figure on the overview.
- **No sync adapters yet.** The mapping table exists; the GitHub and Sheets
  adapters do not.

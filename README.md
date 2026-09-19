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

Other commands:

```bash
npm test          # scheduler unit tests
npm run typecheck
npm run build
npm run db:studio # browse the data
```

## Deploying

**Database — Supabase.** Create a project, then take the connection string from
*Project Settings → Database → Connection string → Session pooler* (this is the
one that works from serverless functions). Put it in `DATABASE_URL`.

**App — Vercel.** Import the repository, add `DATABASE_URL` as an environment
variable, and deploy. `npm run build` runs `prisma generate` first, so no extra
build configuration is needed.

Run `npx prisma db push` against the production database once before the first
deploy.

## Known limitations

- **No authentication yet.** Anyone with the URL can edit. GitHub OAuth is the
  intended fix — everyone on the team already has an account, and it doubles as
  the credential for the GitHub Projects sync.
- **Completed tasks have no history.** The schema records estimates and
  progress but not actual start and finish dates, so a done task is drawn at
  today rather than where it really happened. Adding `startedAt`/`completedAt`
  is the fix, and is a prerequisite for any velocity reporting.
- **Dependencies are created in the database, not the UI.** The seed builds the
  graph; there is no screen for adding an edge yet.
- **No sync adapters yet.** The mapping table exists; the GitHub and Sheets
  adapters do not.

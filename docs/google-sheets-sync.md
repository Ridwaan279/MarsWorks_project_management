# Google Sheets sync

The master timeline sheet and Mission Control stay in step both ways. Edit a
task in either place and the other catches up: sheet edits reach the website
within seconds, and website edits reach the sheet within seconds (with the
optional web app) or at most five minutes (without it).

Setup takes about ten minutes and is done once.

## What you need

- Edit access to the Vercel project.
- Edit access to the master timeline sheet. It can live in a shared drive.
- Whoever runs the setup owns the sync's triggers, which run as them. Use an
  account that will stay with the team (a shared team account is ideal): if
  that account later loses access to the sheet, syncing stops. The overview
  page will say so if it does.

## Part 1 -- the website (Vercel)

1. **Make a secret.** Any long random string works. To generate one, run
   `openssl rand -hex 32` in a terminal, or use
   <https://www.random.org/strings/> (20 characters, letters and digits).
   Keep it somewhere safe: you will paste it twice.

2. In Vercel, open the project, then **Settings > Environment Variables**, and
   add, for the **Production** environment:

   | Name                 | Value                                                                 |
   | -------------------- | --------------------------------------------------------------------- |
   | `SHEETS_SYNC_SECRET` | the secret from step 1                                                |
   | `DIRECT_URL`         | Supabase's **Session pooler** connection string (port **5432**)      |

   `DIRECT_URL` is now **required**: each deploy uses it to update the
   database itself when the code adds columns (this release does). Without it
   a deploy stops with a message saying so, and the previous version stays
   live -- nothing breaks, it just will not update. Find it in Supabase under
   **Project Settings > Database > Connection string > Session pooler**.

3. **Redeploy**: Deployments > the latest one > ... > Redeploy.

4. Check it worked: open `https://<your-site>/api/health`. Every line should
   say `true`, including **Schema up to date**.

## Part 2 -- the sheet

1. **Back up the sheet first**: File > Make a copy. The first sync writes the
   website's tasks into tabs that are currently empty (Mech and Elec), around
   80 rows in all, adds a column to each task tab, and adds the website's
   statuses to each Status dropdown.

2. In the sheet, open **Extensions > Apps Script**.

3. Delete everything in `Code.gs`, then paste in the whole of
   [`scripts/google-sheets/MarsWorksSync.gs`](../scripts/google-sheets/MarsWorksSync.gs).
   Click the save icon. (Optionally rename the project, top left, to
   "MarsWorks Sync".)

4. Go back to the sheet and **reload the page**. A **MarsWorks** menu appears
   after a few seconds.

5. Choose **MarsWorks > Set up sync**.
   - Google asks you to authorise the script. Because it is your own script
     and not a published app, it shows **"Google hasn't verified this app"**:
     click **Advanced**, then **Go to MarsWorks Sync (unsafe)**, then
     **Allow**. It asks for access to this spreadsheet, to connect to an
     external service (your website), and to run while you are away (the
     triggers).
   - Enter the website address, e.g. `https://marsworks.vercel.app`.
   - Enter the secret from Part 1.

   Setup checks the connection before changing anything, adds the
   **Website ID** column, installs the triggers and runs the first sync, then
   shows what it did.

That is everything required. Edits in the sheet now sync within seconds, and
the whole sheet is checked every five minutes.

## Part 3 (optional) -- instant updates from the website

Without this, a change made on the website reaches the sheet at the next
five-minute check. With it, the website tells the sheet straight away.

1. In the Apps Script editor: **Deploy > New deployment**. Click the gear next
   to "Select type" and choose **Web app**.
2. Set **Execute as: Me** and **Who has access: Anyone**, then **Deploy**.
3. Copy the **Web app URL** (it ends in `/exec`).
4. In Vercel, add `SHEETS_WEBAPP_URL` = that URL, and redeploy.

"Anyone" means anyone with the URL can *call* it, but the script ignores any
call without the secret. If the university's Google Workspace does not allow
"Anyone", skip this part: sync still works on the five-minute check.

## Updating the script

When a new version of `MarsWorksSync.gs` comes out:

1. In the sheet, **Extensions > Apps Script**. Select everything in `Code.gs`,
   delete it, paste in the new version, and click the save icon.
2. In the sheet, **MarsWorks > Sync now** (or wait up to five minutes). The
   triggers run the saved code automatically; there is no need to set up
   again.
3. Only if you did Part 3: **Deploy > Manage deployments**, click the pencil,
   set **Version: New version**, then **Deploy**. The web app URL stays the
   same, so nothing changes in Vercel.

## How the two sides line up

| Sheet tab                   | Sub-team on the website |
| --------------------------- | ----------------------- |
| Leadership and Milestones   | Operations              |
| Mech Tasks                  | Mechanical              |
| Elec Tasks                  | Electronics             |
| Robotics Tasks              | Robotics                |
| Sci Tasks                   | Science                 |
| Software Tasks              | Software                |

**Drone Tasks** and **Mini Tasks** are not linked to a sub-team, so they are
left alone (they are empty today). If they should be, say which sub-team each
belongs to and the mapping is one line in `src/lib/sheets/schema.ts`. The
"Timeline" tabs are Google's own views of the task tabs and are never touched.

| Sheet column | Website                                                     |
| ------------ | ----------------------------------------------------------- |
| Tasks        | Title                                                       |
| Assignee     | The person, if it exactly matches a member's name; otherwise kept as written (e.g. "Executive Team") |
| Start Date   | Planned start                                               |
| End Date     | Planned end                                                 |
| Status       | Status (see below)                                          |
| Notes        | Notes                                                       |
| Website ID   | The task's key, e.g. `SW-4`. **Filled in by the sync -- please do not edit it.** |

Everything else -- description, checklist, links, dependencies, flags,
priority -- lives only on the website. Extra columns you add to the sheet are
never touched.

**Statuses.** Every tab's Status dropdown offers every status the website
has, so a status means the same thing in both places:

| Website     | Sheet       | Cell colour |
| ----------- | ----------- | ----------- |
| Backlog     | Backlog     | grey        |
| To do       | Not Started | red         |
| In progress | In-Progress | yellow      |
| Blocked     | Blocked     | deep red    |
| In review   | In Review   | purple      |
| Done        | Complete    | green       |
| --          | Milestone   | blue        |

The sync adds the missing words to each dropdown itself and keeps any word a
team added of its own. Not Started, In-Progress, Complete and Milestone keep the
colours the sheet already used; the three new ones are light enough to read on
a timeline card.

Google does not let a script colour dropdown **chips**, so the sync colours the
whole **cell** instead (conditional formatting on the Status column). Extending
the dropdown can turn the chips themselves grey. To tidy that, per tab:
**Data > Data validation**, click the Status rule, then either click the circle
beside each option and pick its colour, or open **Advanced options** and set
**Display style** to **Plain text** so the coloured cell shows on its own. The
sync will not undo either.

**Milestones** are the rows whose Status is "Milestone", as now. The website
uses the End Date (or the Start Date if End is empty).

## The timeline tabs

Each "... Timeline" tab is a Google timeline view of its task tab. Google does
not let scripts create or change these, so the sync cannot fix them; this is a
one-off check per tab (about a minute each).

Open the timeline tab, click the timeline, and open its **Settings** panel on
the right (if it is hidden: **Timeline settings** in the toolbar). Set:

| Setting      | Value                                                             |
| ------------ | ----------------------------------------------------------------- |
| Data range   | `'Software Tasks'!A1:F1000` -- the tab's name, and **1000** rows   |
| Card title   | Tasks                                                             |
| Start date   | Start Date                                                        |
| End date     | End Date                                                          |
| Card details | Assignee (optional)                                               |
| Card colour  | Status                                                            |

The data range matters most. A timeline only shows the rows inside its range,
and a range drawn around the rows that existed when it was made leaves out
every row added since, including the ones the sync writes. Mech, Elec,
Robotics and Sci had empty tabs, so their timelines are the likeliest to be
showing nothing. `A1:F1000` covers the whole tab.

A task appears on the timeline only when its row has dates: a row with no
**Start Date** is left off, and one whose **End Date** comes before its start
may not show properly. Give a task dates (in the sheet or on the website) to
put it on the timeline. The sync notes rows whose dates are the wrong way
round: MarsWorks > Show last sync.

Tabs without a timeline yet: **Insert > Timeline**, choose the tab's range
(`A1:F1000`), and set the same fields.

## What happens when

- **You add a row in the sheet** -> it becomes a task on the website, and its
  Website ID appears in the row.
- **You copy a row** to start a similar task -> the copy becomes a new task
  with its own ID.
- **You move a row to another tab** -> the task moves to that sub-team.
- **You delete a row** -> the task is deleted on the website. If more than a
  quarter of a tab's rows disappear in one go, that looks like an accident (a
  deleted range, a sort over a filter), so the rows are **put back** and the
  sync says why. To remove many tasks deliberately, delete them on the website,
  or a few rows at a time.
- **You delete a task on the website** -> its row is removed from the sheet.
- **The same field is edited in both places** before a sync -> the website's
  version is kept, and the row gets a note saying so. Different fields edited
  in each place both survive.

**The first sync** links each existing row to the website task with the same
name in the same sub-team. Where the two disagree, **the sheet wins** (unless
its cell is empty), on the basis that the sheet is what the team has been
keeping up to date. If the website has had more recent edits than the sheet,
make the sheet match before setting up.

## Checking on it

- **On the website:** the overview page says when the sheet last synced, and
  turns amber if it is failing or has gone quiet for over 20 minutes.
- **In the sheet:** MarsWorks > Show last sync shows what the last sync did and
  any notes, e.g. a date it could not read or a task that ends before it
  starts. MarsWorks > Sync now runs one immediately.
- **If it stops:** run MarsWorks > Set up sync again. It is safe to repeat; it
  replaces the triggers rather than adding more.

## Changing the secret

Set the new value in Vercel and redeploy, then run MarsWorks > Set up sync in
the sheet and enter the new secret.

## Testing changes to the sync

`scripts/google-sheets/simulate.mjs` runs the real Apps Script against a
running copy of the website, with Google's services replaced by in-memory
fakes. It walks through first sync, edits on each side, conflicts, new and
copied rows, deletions, moving tabs and a wrong secret, and checks both sides
after each. Point it at a disposable database.

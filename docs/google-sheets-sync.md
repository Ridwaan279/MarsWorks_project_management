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
   80 rows in all, and adds a column to each task tab.

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

If you later paste a new version of the script, use **Deploy > Manage
deployments > edit (pencil) > Version: New version** so the web app picks it
up. The triggers pick up changes automatically.

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

**Statuses.** The sheet keeps its own three words, so its coloured dropdowns
are untouched:

| Website                    | Sheet       |
| -------------------------- | ----------- |
| Backlog, To do             | Not Started |
| In progress, Blocked, In review | In-Progress |
| Done                       | Complete    |

A task Blocked or In review on the website shows as In-Progress in the sheet
and **stays** Blocked or In review: only typing a *different* word in the sheet
counts as a change.

**Milestones** are the rows whose Status is "Milestone", as now. The website
uses the End Date (or the Start Date if End is empty).

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

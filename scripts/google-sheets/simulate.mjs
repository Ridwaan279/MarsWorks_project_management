/**
 * Runs MarsWorksSync.gs outside Google, against a running copy of the website,
 * to check the whole sync end to end without touching a real spreadsheet.
 *
 * The Apps Script globals (SpreadsheetApp, UrlFetchApp, ...) are replaced by
 * small in-memory fakes; the HTTP calls are real. Scenarios drive the sheet
 * the way a person would -- edit a cell, delete a row, copy a row -- then fire
 * the same trigger Google would and check both sides.
 *
 *   node scripts/google-sheets/simulate.mjs <sheet.json> <app-url> <secret> <database-url>
 *
 * sheet.json is a list of { name, rows } with dates as { date: "YYYY-MM-DD" }.
 * The database URL is only read, to check the website's side; the scenarios
 * change data through the website, so use a disposable copy.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import vm from "node:vm";

const [sheetPath, appUrl, secret, databaseUrl] = process.argv.slice(2);
if (!sheetPath || !appUrl || !secret || !databaseUrl) {
  console.error("usage: simulate.mjs <sheet.json> <app-url> <secret> <database-url>");
  process.exit(2);
}

const TZ = "Europe/London";

// --- dates, as Sheets holds them: a Date at midnight in the sheet's timezone ---

function tzOffsetMs(utcMs, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - utcMs;
}
function localMidnight(day, timeZone) {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  return new Date(guess - tzOffsetMs(guess, timeZone));
}
function formatDay(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// --- the fake spreadsheet ---------------------------------------------------

class FakeRange {
  constructor(sheet, row, col, rows = 1, cols = 1) {
    Object.assign(this, { sheet, row, col, rows, cols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const line = [];
      for (let c = 0; c < this.cols; c++) line.push(this.sheet.get(this.row + r, this.col + c));
      out.push(line);
    }
    return out;
  }
  setValue(v) { this.sheet.set(this.row, this.col, v); return this; }
  setValues(values) {
    values.forEach((line, r) => line.forEach((v, c) => this.sheet.set(this.row + r, this.col + c, v)));
    return this;
  }
  setNote(note) { this.sheet.notes.set(`${this.row}:${this.col}`, note); return this; }
  setFontWeight() { return this; }
  setDataValidation() { this.sheet.validationTouched = true; return this; }
  protect() { const p = { setDescription: () => p, setWarningOnly: () => p }; this.sheet.protections++; return p; }
}

class FakeSheet {
  constructor(name, rows) {
    this.name = name;
    this.cells = rows.map((r) => r.map((v) => (v && typeof v === "object" && v.date ? localMidnight(v.date, TZ) : v)));
    this.notes = new Map();
    this.protections = 0;
    this.validationTouched = false;
  }
  getName() { return this.name; }
  getType() { return "GRID"; }
  get(r, c) { return (this.cells[r - 1] ?? [])[c - 1] ?? ""; }
  set(r, c, v) {
    while (this.cells.length < r) this.cells.push([]);
    const line = this.cells[r - 1];
    while (line.length < c) line.push("");
    line[c - 1] = v;
  }
  getLastRow() {
    for (let r = this.cells.length; r >= 1; r--) if (this.cells[r - 1].some((v) => v !== "" && v !== null)) return r;
    return 0;
  }
  getLastColumn() {
    return this.cells.reduce((w, line) => {
      for (let c = line.length; c >= 1; c--) if (line[c - 1] !== "" && line[c - 1] !== null) return Math.max(w, c);
      return w;
    }, 0);
  }
  getMaxRows() { return 1000; }
  getRange(r, c, nr, nc) { return new FakeRange(this, r, c, nr, nc); }
  deleteRow(r) { this.cells.splice(r - 1, 1); }
  // Helpers for the scenarios.
  header() { return (this.cells[0] ?? []).map(String); }
  col(name) { return this.header().indexOf(name) + 1; }
  rowWhere(field, value) {
    const c = this.col(field);
    for (let r = 2; r <= this.getLastRow(); r++) if (String(this.get(r, c)).trim() === value) return r;
    return 0;
  }
  dataRows() {
    const out = [];
    for (let r = 2; r <= this.getLastRow(); r++) out.push(r);
    return out;
  }
}

/**
 * A Google Sheets timeline view. Apps Script reports it as an OBJECT sheet,
 * and any attempt to read or write its cells throws -- which the xlsx export
 * hides by turning it into an empty grid. Faked here so that is caught.
 */
class FakeObjectSheet {
  constructor(name) { this.name = name; }
  getName() { return this.name; }
  getType() { return "OBJECT"; }
  header() { return []; }
}
const unsupported = () => { throw new Error("Exception: The action is not supported for the OBJECT sheet."); };
for (const method of ["getLastRow", "getLastColumn", "getMaxRows", "getRange", "deleteRow"]) {
  FakeObjectSheet.prototype[method] = unsupported;
}

const isTimeline = (name) => /Timeline$|Timel$/.test(name);
const tabs = JSON.parse(readFileSync(sheetPath, "utf8")).map((t) =>
  isTimeline(t.name) ? new FakeObjectSheet(t.name) : new FakeSheet(t.name, t.rows),
);
const ss = {
  getSheets: () => tabs,
  getSheetByName: (n) => tabs.find((t) => t.name === n) ?? null,
  getSpreadsheetTimeZone: () => TZ,
  toast: () => {},
};
const tab = (n) => ss.getSheetByName(n);

const props = new Map();
const triggers = [];
const uiAnswers = [];
const alerts = [];

const ui = {
  ButtonSet: { OK: "OK", OK_CANCEL: "OK_CANCEL" },
  Button: { OK: "OK", CANCEL: "CANCEL" },
  prompt: () => {
    const text = uiAnswers.shift() ?? "";
    return { getSelectedButton: () => "OK", getResponseText: () => text };
  },
  alert: (title, body) => alerts.push({ title, body }),
  createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }),
};

function chainTrigger(handler) {
  const t = { handler, kind: "" };
  const chain = {
    forSpreadsheet: () => chain,
    onChange: () => { t.kind = "change"; return chain; },
    timeBased: () => chain,
    everyMinutes: (n) => { t.kind = `every ${n} min`; return chain; },
    create: () => { triggers.push(t); return t; },
  };
  return chain;
}

const sandbox = {
  SpreadsheetApp: {
    getActive: () => ss,
    getUi: () => ui,
    SheetType: { GRID: "GRID", OBJECT: "OBJECT", DATASOURCE: "DATASOURCE" },
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (props.has(k) ? props.get(k) : null),
      setProperty: (k, v) => props.set(k, String(v)),
    }),
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  ScriptApp: {
    getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t.handler })),
    deleteTrigger: () => {},
    newTrigger: chainTrigger,
  },
  UrlFetchApp: {
    // Apps Script's fetch is synchronous, so the fake shells out to curl.
    fetch(url, options) {
      const args = ["-s", "-w", "\n%{http_code}", "-X", options.method.toUpperCase(), url];
      for (const [k, v] of Object.entries(options.headers ?? {})) args.push("-H", `${k}: ${v}`);
      if (options.payload) args.push("-H", `Content-Type: ${options.contentType}`, "--data-binary", "@-");
      const out = execFileSync("curl", args, { input: options.payload ?? "", maxBuffer: 64 * 1024 * 1024 }).toString();
      const cut = out.lastIndexOf("\n");
      const body = out.slice(0, cut);
      const code = Number(out.slice(cut + 1));
      return { getResponseCode: () => code, getContentText: () => body };
    },
  },
  Utilities: {
    formatDate: (date, timeZone) => formatDay(date, timeZone),
    parseDate: (text, timeZone) => localMidnight(text, timeZone),
  },
  ContentService: {
    MimeType: { JSON: "json" },
    createTextOutput: (s) => ({ setMimeType: () => ({ content: s }) }),
  },
  console,
};
vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL("./MarsWorksSync.gs", import.meta.url), "utf8"), sandbox);
const gs = sandbox;

// --- acting as a person on the board, and checking the website's side ------

function api(method, path, body) {
  const args = ["-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", method, appUrl + path, "-H", "Content-Type: application/json"];
  if (body) args.push("--data-binary", JSON.stringify(body));
  return Number(execFileSync("curl", args).toString());
}
function sql(query) {
  return execFileSync("psql", [databaseUrl, "-tAc", query]).toString().trim();
}
const taskBy = (where) => {
  const line = sql(`select id||'|'||key||'|'||title||'|'||status||'|'||coalesce(notes,'')||'|'||(select key from "Team" where id="teamId") from "Task" where ${where} limit 1`);
  if (!line) return null;
  const [id, key, title, status, notes, team] = line.split("|");
  return { id, key, title, status, notes, team };
};
const lastSync = () => JSON.parse(props.get("LAST_SYNC") ?? "null");
const cell = (sheet, row, header) => sheet.get(row, sheet.col(header));
const setCell = (sheet, row, header, v) => sheet.set(row, sheet.col(header), v);

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
}
/** What a person's edit does: Google fires the change trigger. */
const edit = () => gs.onSheetChange({ changeType: "EDIT" });
const settledQuietly = () => {
  gs.runSync_("check", 0);
  const s = lastSync();
  return s.ok && (!s.summary || (s.summary.rowsWritten === 0 && s.summary.rowsDeleted === 0 && s.summary.tasksUpdated === 0 && s.summary.tasksCreated === 0));
};

const ID = "Website ID";
const LEAD = tab("Leadership and Milestones");
const SW = tab("Software Tasks");
const MECH = tab("Mech Tasks");
const ELEC = tab("Elec Tasks");

console.log("\n1. Setup and first sync");
const tasksBefore = Number(sql(`select count(*) from "Task"`));
uiAnswers.push(appUrl, secret);
gs.setup();
check("setup reports success", alerts.at(-1)?.title === "Sync is set up", alerts.at(-1)?.body?.split("\n")[0]);
check("change trigger and 5-minute schedule installed",
  triggers.some((t) => t.handler === "onSheetChange" && t.kind === "change") &&
  triggers.some((t) => t.handler === "scheduledSync" && t.kind === "every 5 min"));
check("Website ID column added to every task tab, timeline tabs untouched",
  tabs.filter((t) => t.header().includes("Tasks")).every((t) => t.header().includes(ID)) &&
  tabs.filter((t) => isTimeline(t.name)).every((t) => t instanceof FakeObjectSheet));
check("the sheet's Status dropdowns were left alone", tabs.every((t) => !t.validationTouched));
const unlabelled = [LEAD, SW].flatMap((t) => t.dataRows().filter((r) => !String(cell(t, r, ID)).trim()).map((r) => `${t.name}:${r}`));
check("every existing row now carries an ID", unlabelled.length === 0, unlabelled.join(", "));
check("existing tasks were linked, not duplicated",
  sql(`select count(*) from "Task" where title='Handover and Planning'`) === "1" &&
  sql(`select count(*) from "Task" where title='Sub-Team Dev Plans'`) === "1");
const merch = taskBy(`title='Order Merch'`);
check("a row only in the sheet became a task", merch?.team === "OPS", merch?.key);
check("the sheet's status won on first contact (Sub-Team Dev Plans: Complete -> DONE)",
  taskBy(`title='Sub-Team Dev Plans'`)?.status === "DONE");
check("milestone rows carry milestone IDs, not new tasks",
  [11, 12, 13, 14, 15].every((r) => String(cell(LEAD, r, ID)).startsWith("M:")) &&
  sql(`select count(*) from "Task" where title ilike 'Milestone:%'`) === "0");
const mechInDb = Number(sql(`select count(*) from "Task" t join "Team" m on m.id=t."teamId" where m.key='MECH'`));
check("website-only tasks were written into their tab (Mech was empty)", MECH.dataRows().length === mechInDb, `${MECH.dataRows().length} rows for ${mechInDb} tasks`);
check("only one new task created by the first sync", Number(sql(`select count(*) from "Task"`)) === tasksBefore + 1);
check("a second sync finds nothing to do", settledQuietly(), JSON.stringify(lastSync().summary));

console.log("\n2. Editing the sheet");
let r = SW.rowWhere(ID, "SW-1");
setCell(SW, r, "Status", "Complete");
edit();
let t = taskBy(`key='SW-1'`);
check("status typed in the sheet reaches the website", t.status === "DONE");
check("and its progress follows", sql(`select progress from "Task" where key='SW-1'`) === "100");

console.log("\n3. Editing on the website");
const sw3 = taskBy(`key='SW-3'`);
api("PATCH", `/api/tasks/${sw3.id}`, { title: "Repo setup (renamed on the website)" });
gs.doPost({ postData: { contents: JSON.stringify({ secret, reason: "website" }) } });
check("a title changed on the board appears in the sheet", cell(SW, SW.rowWhere(ID, "SW-3"), "Tasks") === "Repo setup (renamed on the website)");

console.log("\n4. Statuses the sheet has no word for");
const sw4 = taskBy(`key='SW-4'`);
api("PATCH", `/api/tasks/${sw4.id}`, { status: "IN_PROGRESS" });
gs.runSync_("website", 0);
api("PATCH", `/api/tasks/${sw4.id}`, { status: "BLOCKED" });
gs.runSync_("website", 0);
check("Blocked shows as In-Progress in the sheet", cell(SW, SW.rowWhere(ID, "SW-4"), "Status") === "In-Progress");
gs.runSync_("schedule", 0);
check("and stays Blocked on the website after syncing back", taskBy(`key='SW-4'`).status === "BLOCKED");

console.log("\n5. The same field edited on both sides");
const sw5 = taskBy(`key='SW-5'`);
r = SW.rowWhere(ID, "SW-5");
setCell(SW, r, "Notes", "typed in the sheet");
api("PATCH", `/api/tasks/${sw5.id}`, { notes: "typed on the website" });
gs.runSync_("schedule", 0);
check("the website's value is kept", taskBy(`key='SW-5'`).notes === "typed on the website" && cell(SW, SW.rowWhere(ID, "SW-5"), "Notes") === "typed on the website");
check("and the row is annotated so the sheet user knows", [...SW.notes.values()].some((n) => /same time/.test(n)));

console.log("\n6. Different fields edited on each side");
const sw6 = taskBy(`key='SW-6'`);
r = SW.rowWhere(ID, "SW-6");
setCell(SW, r, "Notes", "sheet note");
api("PATCH", `/api/tasks/${sw6.id}`, { status: "IN_PROGRESS" });
gs.runSync_("schedule", 0);
t = taskBy(`key='SW-6'`);
check("both edits survive", t.notes === "sheet note" && t.status === "IN_PROGRESS" && cell(SW, SW.rowWhere(ID, "SW-6"), "Status") === "In-Progress");

console.log("\n7. A new row typed into the sheet");
const next = SW.getLastRow() + 1;
setCell(SW, next, "Tasks", "Calibrate the IMU");
setCell(SW, next, "Start Date", SW.get(2, SW.col("Start Date")));
setCell(SW, next, "Status", "Not Started");
edit();
const imu = taskBy(`title='Calibrate the IMU'`);
check("becomes a Software task", imu?.team === "SW", imu?.key);
check("and its row gets the new ID", cell(SW, next, ID) === imu?.key);

console.log("\n8. A row copied to start a similar task");
const copyAt = SW.getLastRow() + 1;
SW.cells.push([...SW.cells[SW.rowWhere(ID, "SW-7") - 1]]);
setCell(SW, copyAt, "Tasks", "Advertising at the freshers fair");
edit();
const copied = taskBy(`title='Advertising at the freshers fair'`);
check("the copy becomes its own task", copied && copied.key !== "SW-7", copied?.key);
check("with its own ID, and the original keeps SW-7", cell(SW, copyAt, ID) === copied?.key && SW.rowWhere(ID, "SW-7") > 0);

console.log("\n9. Deleting a row in the sheet");
SW.deleteRow(SW.rowWhere(ID, imu.key));
gs.onSheetChange({ changeType: "REMOVE_ROW" });
check("deletes the task on the website", taskBy(`key='${imu.key}'`) === null);
check("and remembers the key so it is never reissued", sql(`select count(*) from "SyncTombstone" where ref='${imu.key}'`) === "1");

console.log("\n10. Deleting a task on the website");
api("DELETE", `/api/tasks/${copied.id}`);
gs.doPost({ postData: { contents: JSON.stringify({ secret }) } });
check("removes its row from the sheet", SW.rowWhere(ID, copied.key) === 0);

console.log("\n11. Many rows vanishing at once");
const mechBefore = MECH.dataRows().length;
const mechTasks = sql(`select count(*) from "Task" t join "Team" m on m.id=t."teamId" where m.key='MECH'`);
// More than a quarter of the tab: the point where it stops looking like tidying.
MECH.cells.splice(1, 12);
edit();
check("the tasks are not deleted", sql(`select count(*) from "Task" t join "Team" m on m.id=t."teamId" where m.key='MECH'`) === mechTasks);
check("the rows are put back", MECH.dataRows().length === mechBefore, `${MECH.dataRows().length} of ${mechBefore}`);
check("and the sync says why", (lastSync().summary?.warnings ?? []).some((w) => /looks like an accident/.test(w)));

console.log("\n12. Moving a row to another sub-team's tab");
const moveRow = SW.rowWhere(ID, "SW-8");
const moved = SW.cells.splice(moveRow - 1, 1)[0];
ELEC.cells.push(moved);
edit();
check("moves the task to that sub-team", taskBy(`key='SW-8'`).team === "ELEC");

console.log("\n13. Wrong secret");
const saved = props.get("SYNC_SECRET");
props.set("SYNC_SECRET", "not-the-secret");
const bad = gs.runSync_("check", 0);
props.set("SYNC_SECRET", saved);
check("is refused, and says so", !bad.ok && /secret/i.test(bad.error), bad.error);
const forged = gs.doPost({ postData: { contents: JSON.stringify({ secret: "guess" }) } });
check("a forged web-app call does nothing", JSON.parse(forged.content).ok === false);

console.log("\n14. Settled");
check("a final sync has nothing left to do", settledQuietly(), JSON.stringify(lastSync().summary));

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);

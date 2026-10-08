/**
 * MarsWorks Mission Control <-> Google Sheets sync.
 *
 * Paste this whole file into the sheet's Apps Script editor
 * (Extensions > Apps Script), save, then reload the sheet and choose
 * MarsWorks > Set up sync. Full instructions: docs/google-sheets-sync.md.
 *
 * How it works
 * ------------
 * The website does all the deciding. This script only reads the sheet, sends
 * it to the website, and carries out the edits the website sends back:
 *
 *   - Any edit or row deletion in the sheet triggers a sync within seconds.
 *   - A sync also runs every 5 minutes, catching anything a trigger missed.
 *   - The website can ask for a sync immediately after a change on the board,
 *     if this script is deployed as a web app (optional; see the docs).
 *
 * Each task row carries the task's key (e.g. SW-4) in a "Website ID" column,
 * which this script adds. That is how a row and a task stay matched when
 * either is renamed or moved. Please do not edit that column.
 */

var MARSWORKS = {
  ID_HEADER: "Website ID",
  HEADERS: {
    title: "Tasks",
    assignee: "Assignee",
    start: "Start Date",
    end: "End Date",
    status: "Status",
    notes: "Notes",
  },
  SCHEDULE_MINUTES: 5,
  MAX_PASSES: 3,
};

// ---------------------------------------------------------------- menu & setup

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("MarsWorks")
    .addItem("Sync now", "syncNow")
    .addItem("Show last sync", "showLastSync")
    .addSeparator()
    .addItem("Set up sync", "setup")
    .addToUi();
}

/**
 * One-time setup: asks for the website address and the sync secret, checks
 * they work, adds the Website ID column, installs the triggers, and runs the
 * first sync. The sheet's own columns, dropdowns and colours are left as they
 * are.
 */
function setup() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  var url = promptFor_(ui, "Website address", "The address of Mission Control, e.g. https://marsworks.vercel.app", props.getProperty("APP_URL"));
  if (url === null) return;
  var secret = promptFor_(ui, "Sync secret", "The SHEETS_SYNC_SECRET value you set in Vercel.", props.getProperty("SYNC_SECRET") ? "(unchanged)" : "");
  if (secret === null) return;

  props.setProperty("APP_URL", url.replace(/\/+$/, ""));
  if (secret !== "(unchanged)") props.setProperty("SYNC_SECRET", secret);

  var check = callApp_("get", null);
  if (!check.ok) {
    ui.alert("Could not connect", check.error, ui.ButtonSet.OK);
    return;
  }

  var ss = SpreadsheetApp.getActive();
  ss.getSheets().forEach(function (sheet) {
    if (headerMap_(sheet).title) prepareTab_(sheet);
  });

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    var handler = trigger.getHandlerFunction();
    if (handler === "onSheetChange" || handler === "scheduledSync") ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("onSheetChange").forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger("scheduledSync").timeBased().everyMinutes(MARSWORKS.SCHEDULE_MINUTES).create();

  var result = runSync_("setup", 0);
  ui.alert(
    "Sync is set up",
    (result.ok ? "First sync done. " + describe_(result.summary) : "Setup finished, but the first sync failed: " + result.error) +
      "\n\nFrom now on edits sync within seconds, and everything is checked every " +
      MARSWORKS.SCHEDULE_MINUTES + " minutes.",
    ui.ButtonSet.OK
  );
}

function syncNow() {
  var result = runSync_("manual", 0);
  SpreadsheetApp.getUi().alert(
    result.ok ? "Synced" : "Sync failed",
    result.ok ? describe_(result.summary) : result.error,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function showLastSync() {
  var last = PropertiesService.getScriptProperties().getProperty("LAST_SYNC");
  var info = last ? JSON.parse(last) : null;
  SpreadsheetApp.getUi().alert(
    "Last sync",
    info ? info.at + "\n" + (info.ok ? describe_(info.summary) : "Failed: " + info.error) : "No sync has run yet.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// -------------------------------------------------------------------- triggers

/** Installable change trigger: edits, and rows inserted or deleted. */
function onSheetChange(e) {
  if (e && e.changeType === "FORMAT") return;
  runSync_("edit", Date.now());
}

function scheduledSync() {
  runSync_("schedule", 0);
}

/** Called by the website after a change on the board (optional web app). */
function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (ignored) {}
  var secret = PropertiesService.getScriptProperties().getProperty("SYNC_SECRET");
  if (!secret || body.secret !== secret) return json_({ ok: false, error: "Wrong secret." });
  var result = runSync_("website", Date.now());
  return json_({ ok: result.ok });
}

// ------------------------------------------------------------------------ sync

/**
 * Sync until both sides agree: send the sheet, apply what comes back, and
 * repeat so the website can confirm the edits landed. Usually two passes.
 *
 * `requestedAt` lets a burst of triggers collapse into one sync: if another
 * sync started after this one was asked for, that sync already saw the change.
 */
function runSync_(reason, requestedAt) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) return { ok: false, error: "Another sync is still running." };
  var props = PropertiesService.getScriptProperties();
  try {
    var lastStarted = Number(props.getProperty("LAST_SYNC_STARTED") || 0);
    if (requestedAt && lastStarted > requestedAt) return { ok: true, summary: null, skipped: true };
    props.setProperty("LAST_SYNC_STARTED", String(Date.now()));

    var total = null;
    for (var pass = 0; pass < MARSWORKS.MAX_PASSES; pass++) {
      var snapshot = readSheet_();
      var response = callApp_("post", { reason: pass === 0 ? reason : "settle", tabs: snapshot.tabs });
      if (!response.ok) throw new Error(response.error);
      var applied = applyOps_(response.body.ops || [], snapshot.timeZone);
      total = addSummaries_(total, response.body.summary);
      if (applied === 0) break;
    }
    var record = { at: new Date().toISOString(), ok: true, summary: total };
    props.setProperty("LAST_SYNC", JSON.stringify(record));
    return record;
  } catch (err) {
    var failure = { at: new Date().toISOString(), ok: false, error: String((err && err.message) || err) };
    props.setProperty("LAST_SYNC", JSON.stringify(failure));
    return failure;
  } finally {
    lock.releaseLock();
  }
}

// --------------------------------------------------------------------- reading

/**
 * True for an ordinary tab of cells. The "... Timeline" tabs are Google's
 * timeline views, which Apps Script reports as OBJECT sheets: reading a cell
 * from one throws "The action is not supported for the OBJECT sheet". Chart
 * tabs and connected (data source) sheets are the same, so all are skipped.
 */
function isGrid_(sheet) {
  return !sheet.getType || sheet.getType() === SpreadsheetApp.SheetType.GRID;
}

/** Column numbers (1-based) by field, from the tab's header row. */
function headerMap_(sheet) {
  if (!isGrid_(sheet)) return {};
  var width = sheet.getLastColumn();
  if (width < 1) return {};
  var header = sheet.getRange(1, 1, 1, width).getValues()[0];
  var wanted = {};
  Object.keys(MARSWORKS.HEADERS).forEach(function (field) {
    wanted[MARSWORKS.HEADERS[field].toLowerCase()] = field;
  });
  wanted[MARSWORKS.ID_HEADER.toLowerCase()] = "id";
  var cols = {};
  header.forEach(function (name, i) {
    var field = wanted[String(name).trim().toLowerCase()];
    if (field && !cols[field]) cols[field] = i + 1;
  });
  return cols;
}

/** Adds the Website ID column, with a do-not-edit warning, if it is missing. */
function prepareTab_(sheet) {
  var cols = headerMap_(sheet);
  if (!cols.title) return cols; // not a task tab: never add a column to it
  if (!cols.id) {
    var col = sheet.getLastColumn() + 1;
    sheet.getRange(1, col).setValue(MARSWORKS.ID_HEADER).setFontWeight("bold");
    var protection = sheet.getRange(1, col, sheet.getMaxRows(), 1).protect();
    protection.setDescription("Filled in by the MarsWorks website sync. Editing it unlinks the row.");
    protection.setWarningOnly(true);
    cols = headerMap_(sheet);
  }
  return cols;
}

function readSheet_() {
  var ss = SpreadsheetApp.getActive();
  var timeZone = ss.getSpreadsheetTimeZone();
  var tabs = [];
  ss.getSheets().forEach(function (sheet) {
    var cols = headerMap_(sheet);
    if (!cols.title) return; // a timeline view or some other tab
    if (!cols.id) cols = prepareTab_(sheet);
    var last = sheet.getLastRow();
    var rows = [];
    if (last >= 2) {
      var values = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
      values.forEach(function (r, i) {
        var row = {
          row: i + 2,
          id: text_(r, cols.id),
          title: text_(r, cols.title),
          assignee: text_(r, cols.assignee),
          start: date_(r, cols.start, timeZone),
          end: date_(r, cols.end, timeZone),
          status: text_(r, cols.status),
          notes: text_(r, cols.notes),
        };
        if (row.id || row.title || row.status) rows.push(row);
      });
    }
    tabs.push({ name: sheet.getName(), rows: rows });
  });
  return { timeZone: timeZone, tabs: tabs };
}

function text_(row, col) {
  if (!col) return "";
  var v = row[col - 1];
  return v === null || v === undefined ? "" : String(v).trim();
}

function date_(row, col, timeZone) {
  if (!col) return "";
  var v = row[col - 1];
  // Not `instanceof Date`: that is false for a Date made in another context.
  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, timeZone, "yyyy-MM-dd");
  }
  return v === null || v === undefined ? "" : String(v).trim();
}

// -------------------------------------------------------------------- writing

/** Carries out the website's instructions. Returns how many were applied. */
function applyOps_(ops, timeZone) {
  if (!ops.length) return 0;
  var ss = SpreadsheetApp.getActive();
  var tabs = {};
  function tab(name) {
    if (!(name in tabs)) {
      var sheet = ss.getSheetByName(name);
      tabs[name] = sheet ? { sheet: sheet, cols: prepareTab_(sheet) } : null;
    }
    return tabs[name];
  }

  var applied = 0;
  var index = indexIds_(ss);
  var appends = {};

  ops.forEach(function (op) {
    if (op.op !== "upsert") return;
    var target = tab(op.tab);
    if (!target) return;

    var found = (index[op.id] || [])[0] || null;
    if (found && found.tab !== op.tab) {
      // Moved to another sub-team: take the row out of the old tab.
      ss.getSheetByName(found.tab).deleteRow(found.row);
      index = indexIds_(ss);
      found = null;
    }
    var rowNumber = found ? found.row : op.at ? claimRow_(target, op.at, index) : 0;
    if (rowNumber) {
      writeRow_(target, rowNumber, op, timeZone);
      index[op.id] = [{ tab: op.tab, row: rowNumber }];
    } else {
      (appends[op.tab] = appends[op.tab] || []).push(op);
    }
    applied++;
  });

  Object.keys(appends).forEach(function (name) {
    var target = tab(name);
    var start = target.sheet.getLastRow() + 1;
    appends[name].forEach(function (op, i) {
      writeRow_(target, start + i, op, timeZone);
    });
  });

  // Deletes last, bottom-up, so earlier row numbers stay valid.
  var doomed = [];
  ops.forEach(function (op) {
    if (op.op !== "delete") return;
    (index[op.id] || []).forEach(function (loc) {
      doomed.push(loc);
    });
    applied++;
  });
  doomed.sort(function (a, b) {
    return a.tab === b.tab ? b.row - a.row : a.tab < b.tab ? -1 : 1;
  });
  doomed.forEach(function (loc) {
    ss.getSheetByName(loc.tab).deleteRow(loc.row);
  });

  return applied;
}

/** Website ID -> every row carrying it. */
function indexIds_(ss) {
  var index = {};
  ss.getSheets().forEach(function (sheet) {
    var cols = headerMap_(sheet);
    if (!cols.title || !cols.id) return;
    var last = sheet.getLastRow();
    if (last < 2) return;
    sheet.getRange(2, cols.id, last - 1, 1).getValues().forEach(function (r, i) {
      var id = String(r[0] || "").trim();
      if (id) (index[id] = index[id] || []).push({ tab: sheet.getName(), row: i + 2 });
    });
  });
  return index;
}

/**
 * The row a newly created item should get its ID in: the row it was read
 * from, if its title still matches, or else the first row with that title
 * whose ID is empty or shared with another row.
 */
function claimRow_(target, at, index) {
  var sheet = target.sheet;
  var cols = target.cols;
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var titles = sheet.getRange(2, cols.title, last - 1, 1).getValues();
  var ids = sheet.getRange(2, cols.id, last - 1, 1).getValues();
  var want = String(at.title).trim();
  var i = at.row - 2;
  if (i >= 0 && i < titles.length && String(titles[i][0]).trim() === want) return at.row;
  for (var j = 0; j < titles.length; j++) {
    if (String(titles[j][0]).trim() !== want) continue;
    var id = String(ids[j][0] || "").trim();
    if (!id || (index[id] || []).length > 1) return j + 2;
  }
  return 0;
}

function writeRow_(target, rowNumber, op, timeZone) {
  var sheet = target.sheet;
  var cols = target.cols;
  var values = op.values || {};
  Object.keys(values).forEach(function (field) {
    var col = cols[field];
    if (!col) return;
    var v = values[field];
    if ((field === "start" || field === "end") && v) v = Utilities.parseDate(v, timeZone, "yyyy-MM-dd");
    sheet.getRange(rowNumber, col).setValue(v);
  });
  sheet.getRange(rowNumber, cols.id).setValue(op.id);
  if (op.note && cols.title) sheet.getRange(rowNumber, cols.title).setNote(op.note);
}

// ------------------------------------------------------------------- helpers

function callApp_(method, payload) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty("APP_URL");
  var secret = props.getProperty("SYNC_SECRET");
  if (!url || !secret) return { ok: false, error: "Not set up yet: choose MarsWorks > Set up sync." };
  var options = {
    method: method,
    headers: { "x-sync-secret": secret },
    muteHttpExceptions: true,
  };
  if (payload) {
    options.contentType = "application/json";
    options.payload = JSON.stringify(payload);
  }
  var response;
  try {
    response = UrlFetchApp.fetch(url + "/api/sheets/sync", options);
  } catch (err) {
    return { ok: false, error: "Could not reach " + url + ": " + err };
  }
  var code = response.getResponseCode();
  var body = {};
  try {
    body = JSON.parse(response.getContentText());
  } catch (ignored) {}
  if (code !== 200) return { ok: false, error: (body && body.error) || "The website answered " + code + "." };
  return { ok: true, body: body };
}

function addSummaries_(a, b) {
  if (!a) return b;
  if (!b) return a;
  var out = {};
  Object.keys(b).forEach(function (k) {
    if (k !== "warnings") out[k] = (a[k] || 0) + (b[k] || 0);
  });
  // Every pass's notes, once each: the first pass says why rows were put
  // back, and the settle pass that follows must not hide it.
  var notes = [];
  (a.warnings || []).concat(b.warnings || []).forEach(function (w) {
    if (notes.indexOf(w) === -1) notes.push(w);
  });
  out.warnings = notes;
  return out;
}

function describe_(s) {
  if (!s) return "Nothing to change.";
  var parts = [];
  if (s.tasksCreated) parts.push(s.tasksCreated + " task(s) created on the website");
  if (s.tasksUpdated) parts.push(s.tasksUpdated + " updated on the website");
  if (s.tasksDeleted) parts.push(s.tasksDeleted + " deleted on the website");
  if (s.rowsWritten) parts.push(s.rowsWritten + " row(s) written here");
  if (s.rowsDeleted) parts.push(s.rowsDeleted + " row(s) removed here");
  if (s.conflicts) parts.push(s.conflicts + " edited on both sides (website kept)");
  var text = parts.length ? parts.join("; ") + "." : "Everything already matched.";
  if (s.warnings && s.warnings.length) text += "\n\nNotes:\n- " + s.warnings.join("\n- ");
  return text;
}

function promptFor_(ui, title, prompt, current) {
  var answer = ui.prompt(title, prompt + (current ? "\n\nCurrently: " + current : ""), ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return null;
  var value = answer.getResponseText().trim();
  return value || current || "";
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

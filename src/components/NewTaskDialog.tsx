"use client";

import { useEffect, useState } from "react";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/domain";
import type {
  MemberView,
  MilestoneView,
  TeamView,
  WorkstreamView,
} from "@/lib/project";

interface Props {
  status: TaskStatus;
  teams: TeamView[];
  members: MemberView[];
  milestones: MilestoneView[];
  workstreams: WorkstreamView[];
  defaultTeamId?: string;
  onClose: () => void;
  /** Lets the board adopt a workstream created from inside this dialog. */
  onWorkstreamCreated: (workstream: WorkstreamView) => void;
  onCreated: (task: {
    id: string;
    teamId: string;
    status: TaskStatus;
    plannedStart: string | null;
    plannedEnd: string | null;
  }) => void;
}

const FIELD =
  "w-full min-w-0 rounded-md border border-line bg-elevated px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const LABEL = "block text-xs font-medium text-ink-2";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Creating a task is the detailed step: everything the scheduler and the other
 * sub-teams rely on should be set here, while it is in mind. Viewing a task
 * afterwards is the abridged one, with the rest behind disclosures.
 */
export function NewTaskDialog({
  status,
  teams,
  members,
  milestones,
  workstreams,
  defaultTeamId,
  onClose,
  onCreated,
  onWorkstreamCreated,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState(defaultTeamId ?? teams[0]?.id ?? "");
  const [assigneeId, setAssigneeId] = useState("");
  const [ownerLabel, setOwnerLabel] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [workstreamId, setWorkstreamId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [taskStatus, setTaskStatus] = useState<TaskStatus>(status);
  // Dated by default: an undated task cannot be forecast, cannot be late and
  // does not appear on the board's Current view, which makes it look lost.
  const [plannedStart, setPlannedStart] = useState(today());
  const [plannedEnd, setPlannedEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Adding a workstream from here, rather than sending someone elsewhere to
  // create one first, which is how tasks end up ungrouped.
  const [addingWorkstream, setAddingWorkstream] = useState(false);
  const [newWorkstreamName, setNewWorkstreamName] = useState("");
  const [newWorkstreamCode, setNewWorkstreamCode] = useState("");
  const [creatingWorkstream, setCreatingWorkstream] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Only offer assignees from the chosen sub-team; cross-team assignment is a
  // deliberate act, not something to do by mis-clicking a long list.
  const eligible = members.filter((m) => m.teamId === teamId);
  const teamWorkstreams = workstreams.filter((w) => w.teamId === teamId);

  function addLink(event: React.FormEvent) {
    event.preventDefault();
    const url = linkUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      setError("Links must start with http:// or https://");
      return;
    }
    setLinks((current) => [...current, { label: linkLabel.trim(), url }]);
    setLinkUrl("");
    setLinkLabel("");
    setError(null);
  }

  async function createWorkstream() {
    const name = newWorkstreamName.trim();
    if (!name || !teamId) return;
    setCreatingWorkstream(true);
    setError(null);
    try {
      const response = await fetch("/api/workstreams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, name, code: newWorkstreamCode.trim() || null }),
      });
      if (!response.ok) {
        setError("Could not create that workstream.");
        return;
      }
      const created: WorkstreamView = await response.json();
      onWorkstreamCreated(created);
      setWorkstreamId(created.id);
      setAddingWorkstream(false);
      setNewWorkstreamName("");
      setNewWorkstreamCode("");
    } catch (cause) {
      console.error("Failed to create workstream", cause);
      setError("Could not create that workstream.");
    } finally {
      setCreatingWorkstream(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !teamId) return;
    if (plannedStart && plannedEnd && plannedStart > plannedEnd) {
      setError("The end date is before the start date.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          notes: notes.trim() || null,
          ownerLabel: ownerLabel.trim() || null,
          teamId,
          status: taskStatus,
          priority,
          assigneeId: assigneeId || null,
          milestoneId: milestoneId || null,
          workstreamId: workstreamId || null,
          plannedStart: plannedStart || null,
          plannedEnd: plannedEnd || null,
          links,
          subtasks,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const fieldErrors = body?.details?.fieldErrors ?? {};
        setError(
          fieldErrors.plannedEnd?.[0] ??
            fieldErrors.links?.[0] ??
            fieldErrors.title?.[0] ??
            "Could not create that task.",
        );
        return;
      }
      const created = await response.json();
      onCreated({
        id: created.id,
        teamId: created.teamId,
        status: created.status,
        plannedStart: created.plannedStart,
        plannedEnd: created.plannedEnd,
      });
    } catch (cause) {
      console.error("Failed to create task", cause);
      setError("Could not create that task.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onClose}
        className="absolute inset-0 bg-black/55"
      />
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="New task"
        className="selectable overscroll-none-safe relative max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-xl border border-line bg-canvas p-5 shadow-2xl"
      >
        <header>
          <h2 className="text-sm font-semibold">New Task</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            Fill in what you know now. Dates matter most — an undated task cannot
            be forecast and will not show on the board&apos;s Current view.
          </p>
        </header>

        <div className="space-y-1.5">
          <label className={LABEL} htmlFor="new-title">
            Title
          </label>
          <input
            id="new-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoComplete="off"
            placeholder="e.g. Machine the suspension uprights"
            className={FIELD}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className={LABEL} htmlFor="new-description">
            Description
          </label>
          <textarea
            id="new-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What counts as done?"
            className={`${FIELD} resize-y`}
          />
        </div>

        {/* The three fields the rest of the tool depends on. Dates are what
            make a task visible to the forecast at all, and the sub-team is
            what the board, the timeline and every health number group by.
            Boxed and accented so they do not read as just three more
            selects among ten. */}
        <section className="space-y-3 rounded-lg border border-accent/35 bg-accent-tint/40 p-3">
          <p className="flex items-center gap-2 text-xs font-medium text-accent">
            Key details
            <span className="font-normal text-ink-3">
              dates and sub-team drive the board, timeline and forecast
            </span>
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className={LABEL} htmlFor="new-start">
                Planned start
              </label>
              <input
                id="new-start"
                type="date"
                value={plannedStart}
                onChange={(e) => setPlannedStart(e.target.value)}
                className={FIELD}
              />
            </div>

            <div className="space-y-1.5">
              <label className={LABEL} htmlFor="new-end">
                Planned end
              </label>
              <input
                id="new-end"
                type="date"
                value={plannedEnd}
                min={plannedStart || undefined}
                onChange={(e) => setPlannedEnd(e.target.value)}
                className={FIELD}
              />
            </div>

            <div className="space-y-1.5">
              <label className={LABEL} htmlFor="new-team">
                Sub-team
              </label>
              <select
                id="new-team"
                value={teamId}
                onChange={(e) => {
                  setTeamId(e.target.value);
                  setAssigneeId("");
                  setWorkstreamId("");
                }}
                className={FIELD}
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className={LABEL} htmlFor="new-assignee">
              Assignee
            </label>
            <select
              id="new-assignee"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className={FIELD}
            >
              <option value="">Unassigned</option>
              {eligible.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className={LABEL} htmlFor="new-status">
              Status
            </label>
            <select
              id="new-status"
              value={taskStatus}
              onChange={(e) => setTaskStatus(e.target.value as TaskStatus)}
              className={FIELD}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className={LABEL} htmlFor="new-priority">
              Priority
            </label>
            <select
              id="new-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className={FIELD}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <label className={LABEL} htmlFor="new-workstream">
                Workstream
              </label>
              <button
                type="button"
                onClick={() => setAddingWorkstream((v) => !v)}
                className="rounded text-[11px] text-accent transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {addingWorkstream ? "Cancel" : "New workstream"}
              </button>
            </div>
            {addingWorkstream ? (
              <div className="space-y-2 rounded-md border border-line bg-panel p-2">
                <div className="flex gap-2">
                  <input
                    value={newWorkstreamCode}
                    onChange={(e) => setNewWorkstreamCode(e.target.value)}
                    autoComplete="off"
                    placeholder="1.0"
                    aria-label="Workstream code, optional"
                    className={`${FIELD} w-16 shrink-0 text-xs`}
                  />
                  <input
                    value={newWorkstreamName}
                    onChange={(e) => setNewWorkstreamName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void createWorkstream();
                      }
                    }}
                    autoComplete="off"
                    placeholder="Pivot Wheel Project"
                    aria-label="Workstream name"
                    className={`${FIELD} text-xs`}
                  />
                </div>
                <button
                  type="button"
                  onClick={createWorkstream}
                  disabled={!newWorkstreamName.trim() || creatingWorkstream}
                  className="w-full rounded-md border border-line px-2 py-1 text-xs text-ink-2 transition-colors hover:bg-elevated hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {creatingWorkstream ? "Adding…" : `Add to ${teams.find((t) => t.id === teamId)?.name ?? "team"}`}
                </button>
              </div>
            ) : (
              <select
                id="new-workstream"
                value={workstreamId}
                onChange={(e) => setWorkstreamId(e.target.value)}
                className={FIELD}
              >
                <option value="">Ungrouped</option>
                {teamWorkstreams.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code ? `${w.code} ${w.name}` : w.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-1.5">
            <label className={LABEL} htmlFor="new-milestone">
              Milestone
            </label>
            <select
              id="new-milestone"
              value={milestoneId}
              onChange={(e) => setMilestoneId(e.target.value)}
              className={FIELD}
            >
              <option value="">None</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className={LABEL} htmlFor="new-owner">
              Owner (as written)
            </label>
            <input
              id="new-owner"
              value={ownerLabel}
              onChange={(e) => setOwnerLabel(e.target.value)}
              autoComplete="off"
              placeholder="For work owned by more than one person, e.g. Owen &amp; Jack"
              className={FIELD}
            />
          </div>
        </div>

        {/* Most tasks arrive with their steps already in someone's head.
            Capturing them here saves reopening the task to type them in. */}
        <div className="space-y-2">
          <h3 className={LABEL}>Checklist</h3>
          {subtasks.length > 0 ? (
            <ul className="space-y-1">
              {subtasks.map((title, i) => (
                <li
                  key={`${title}-${i}`}
                  className="flex items-center gap-2 rounded-md bg-panel px-2.5 py-1.5 text-xs"
                >
                  <span
                    aria-hidden
                    className="h-3.5 w-3.5 shrink-0 rounded-sm ring-1 ring-line"
                  />
                  <span className="min-w-0 flex-1 truncate">{title}</span>
                  <button
                    type="button"
                    onClick={() => setSubtasks((c) => c.filter((_, j) => j !== i))}
                    aria-label={`Remove "${title}"`}
                    className="rounded p-0.5 text-ink-3 transition-colors hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                      <path d="M4.3 3.3a1 1 0 0 1 1.4 0L8 5.6l2.3-2.3a1 1 0 1 1 1.4 1.4L9.4 7l2.3 2.3a1 1 0 0 1-1.4 1.4L8 8.4l-2.3 2.3a1 1 0 0 1-1.4-1.4L6.6 7 4.3 4.7a1 1 0 0 1 0-1.4Z" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="new-subtask">
              Checklist item
            </label>
            <input
              id="new-subtask"
              value={subtaskTitle}
              onChange={(e) => setSubtaskTitle(e.target.value)}
              onKeyDown={(e) => {
                // Enter would otherwise submit the whole form, creating the
                // task while the author is still listing its steps.
                if (e.key === "Enter") {
                  e.preventDefault();
                  const title = subtaskTitle.trim();
                  if (!title) return;
                  setSubtasks((c) => [...c, title]);
                  setSubtaskTitle("");
                }
              }}
              placeholder="Add a step, then press Enter"
              autoComplete="off"
              className={`${FIELD} text-xs`}
            />
            <button
              type="button"
              onClick={() => {
                const title = subtaskTitle.trim();
                if (!title) return;
                setSubtasks((c) => [...c, title]);
                setSubtaskTitle("");
              }}
              disabled={!subtaskTitle.trim()}
              className="shrink-0 rounded-md border border-line px-3 text-xs text-ink-2 transition-colors hover:bg-elevated hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Add
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className={LABEL}>Links</h3>
          {links.length > 0 ? (
            <ul className="space-y-1">
              {links.map((link, i) => (
                <li
                  key={`${link.url}-${i}`}
                  className="flex items-center gap-2 rounded-md bg-panel px-2.5 py-1.5 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate text-accent">
                    {link.label || link.url}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLinks((c) => c.filter((_, j) => j !== i))}
                    aria-label={`Remove ${link.label || link.url}`}
                    className="rounded p-0.5 text-ink-3 transition-colors hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                      <path d="M4.3 3.3a1 1 0 0 1 1.4 0L8 5.6l2.3-2.3a1 1 0 1 1 1.4 1.4L9.4 7l2.3 2.3a1 1 0 0 1-1.4 1.4L8 8.4l-2.3 2.3a1 1 0 0 1-1.4-1.4L6.6 7 4.3 4.7a1 1 0 0 1 0-1.4Z" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <label className="sr-only" htmlFor="new-link-url">
            Link address
          </label>
          <input
            id="new-link-url"
            type="url"
            inputMode="url"
            spellCheck={false}
            autoComplete="off"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              // Enter inside the link field adds a link; it must not submit
              // the whole form.
              if (e.key === "Enter") addLink(e);
            }}
            placeholder="https://drive.google.com/…"
            className={`${FIELD} text-xs`}
          />
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="new-link-label">
              Link label
            </label>
            <input
              id="new-link-label"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              autoComplete="off"
              placeholder="Label (optional)"
              className={`${FIELD} text-xs`}
            />
            <button
              type="button"
              onClick={addLink}
              disabled={!linkUrl.trim()}
              className="shrink-0 rounded-md border border-line px-3 text-xs text-ink-2 transition-colors hover:bg-elevated hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Add Link
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={LABEL} htmlFor="new-notes">
            Notes
          </label>
          <textarea
            id="new-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${FIELD} resize-y`}
          />
        </div>

        <p aria-live="polite" className="text-xs text-danger">
          {error}
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-elevated hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-canvas transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {saving ? "Creating…" : "Create Task"}
          </button>
        </div>
      </form>
    </div>
  );
}

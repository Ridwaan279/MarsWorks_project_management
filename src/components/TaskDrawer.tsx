"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
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
  TaskView,
  TeamView,
  WorkstreamView,
} from "@/lib/project";
import type { ScheduledTask } from "@/lib/schedule";
import { Avatar, ProgressBar, StatusBadge, TeamDot, formatDays } from "./ui";

interface DrawerProps {
  task: TaskView;
  teams: TeamView[];
  members: MemberView[];
  milestones: MilestoneView[];
  workstreams: WorkstreamView[];
  /** Every task on the board, so this one can be made to wait on another. */
  allTasks: TaskView[];
  scheduled: ScheduledTask | undefined;
  onClose: () => void;
  onSaved: (task: TaskView) => void;
}

const FIELD =
  "w-full min-w-0 rounded-md border border-line bg-elevated px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const LABEL = "block text-xs font-medium text-ink-2";

/** <input type="date"> speaks YYYY-MM-DD; the API and the model speak Date. */
function toDateInput(value: Date | string | null): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** A collapsed section. Native <details> so it works without JavaScript and
 *  is keyboard-operable for free. */
function Disclosure({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-line bg-panel">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm text-ink-2 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform group-open:rotate-90"
          fill="currentColor"
        >
          <path d="M6 4l4 4-4 4V4Z" />
        </svg>
        <span className="flex-1">{title}</span>
        {badge ? (
          <span className="text-xs tabular-nums text-ink-3">{badge}</span>
        ) : null}
      </summary>
      <div className="space-y-3 border-t border-line px-3 py-3">{children}</div>
    </details>
  );
}

export function TaskDrawer({
  task,
  teams,
  members,
  milestones,
  workstreams,
  allTasks,
  scheduled,
  onClose,
  onSaved,
}: DrawerProps) {
  const [draft, setDraft] = useState(task);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [dependencyId, setDependencyId] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(task), [task]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const team = teams.find((t) => t.id === draft.teamId);
  const teamWorkstreams = workstreams.filter((w) => w.teamId === draft.teamId);
  const assignee = members.find((m) => m.id === draft.assigneeId);

  const dirty =
    draft.title !== task.title ||
    draft.description !== task.description ||
    draft.status !== task.status ||
    draft.priority !== task.priority ||
    draft.assigneeId !== task.assigneeId ||
    draft.milestoneId !== task.milestoneId ||
    draft.progress !== task.progress ||
    draft.workstreamId !== task.workstreamId ||
    draft.ownerLabel !== task.ownerLabel ||
    draft.notes !== task.notes ||
    toDateInput(draft.plannedStart) !== toDateInput(task.plannedStart) ||
    toDateInput(draft.plannedEnd) !== toDateInput(task.plannedEnd);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          description: draft.description,
          status: draft.status,
          priority: draft.priority,
          assigneeId: draft.assigneeId,
          milestoneId: draft.milestoneId,
          progress: draft.status === "DONE" ? 100 : draft.progress,
          workstreamId: draft.workstreamId,
          ownerLabel: draft.ownerLabel || null,
          notes: draft.notes || null,
          plannedStart: toDateInput(draft.plannedStart) || null,
          plannedEnd: toDateInput(draft.plannedEnd) || null,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(
          body?.details?.fieldErrors?.plannedEnd?.[0] ??
            "Could not save. Check your connection and try again.",
        );
        return;
      }
      onSaved({ ...draft, progress: draft.status === "DONE" ? 100 : draft.progress });
      onClose();
    } catch (cause) {
      console.error("Failed to save task", cause);
      setError("Could not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function addLink(event: React.FormEvent) {
    event.preventDefault();
    if (!linkUrl.trim()) return;
    // A URL with no label is far more common than the reverse, so fall back to
    // the hostname rather than rejecting it.
    let label = linkLabel.trim();
    if (!label) {
      try {
        label = new URL(linkUrl.trim()).hostname.replace(/^www\./, "");
      } catch {
        label = "Link";
      }
    }
    try {
      const response = await fetch(`/api/tasks/${task.id}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, url: linkUrl.trim() }),
      });
      if (!response.ok) {
        setError("Links must start with http:// or https://");
        return;
      }
      const created = await response.json();
      const next = { ...draft, links: [...draft.links, created] };
      setDraft(next);
      onSaved(next);
      setLinkLabel("");
      setLinkUrl("");
      setError(null);
    } catch {
      setError("Could not add that link.");
    }
  }

  async function removeLink(linkId: string) {
    const next = { ...draft, links: draft.links.filter((l) => l.id !== linkId) };
    setDraft(next);
    onSaved(next);
    await fetch(`/api/links/${linkId}`, { method: "DELETE" }).catch(() => {});
  }

  async function addSubtask(event: React.FormEvent) {
    event.preventDefault();
    const title = subtaskTitle.trim();
    if (!title) return;
    try {
      const response = await fetch(`/api/tasks/${task.id}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) {
        setError("Could not add that checklist item.");
        return;
      }
      const created = await response.json();
      const next = {
        ...draft,
        subtasks: [
          ...draft.subtasks,
          { id: created.id, title: created.title, done: created.done },
        ],
      };
      setDraft(next);
      onSaved(next);
      setSubtaskTitle("");
      setError(null);
    } catch {
      setError("Could not add that checklist item.");
    }
  }

  async function toggleSubtask(subtaskId: string, done: boolean) {
    const next = {
      ...draft,
      subtasks: draft.subtasks.map((st) =>
        st.id === subtaskId ? { ...st, done } : st,
      ),
    };
    setDraft(next);
    onSaved(next);
    await fetch(`/api/subtasks/${subtaskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    }).catch(() => {});
  }

  async function removeSubtask(subtaskId: string) {
    const next = {
      ...draft,
      subtasks: draft.subtasks.filter((st) => st.id !== subtaskId),
    };
    setDraft(next);
    onSaved(next);
    await fetch(`/api/subtasks/${subtaskId}`, { method: "DELETE" }).catch(() => {});
  }

  async function addDependency(event: React.FormEvent) {
    event.preventDefault();
    if (!dependencyId) return;
    try {
      const response = await fetch(`/api/tasks/${task.id}/dependencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predecessorId: dependencyId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        // The API explains a refused link (a loop, a duplicate); it is more
        // useful than anything this component could guess.
        setError(body?.error ?? "Could not add that dependency.");
        return;
      }
      const created = await response.json();
      const predecessor = allTasks.find((t) => t.id === dependencyId);
      if (predecessor) {
        const next = {
          ...draft,
          blockedBy: [
            ...draft.blockedBy,
            {
              depId: created.id,
              id: predecessor.id,
              key: predecessor.key,
              title: predecessor.title,
              teamId: predecessor.teamId,
            },
          ],
        };
        setDraft(next);
        onSaved(next);
      }
      setDependencyId("");
      setError(null);
    } catch {
      setError("Could not add that dependency.");
    }
  }

  async function removeDependency(depId: string) {
    const next = {
      ...draft,
      blockedBy: draft.blockedBy.filter((d) => d.depId !== depId),
      blocks: draft.blocks.filter((d) => d.depId !== depId),
    };
    setDraft(next);
    onSaved(next);
    await fetch(`/api/dependencies/${depId}`, { method: "DELETE" }).catch(() => {});
  }

  const doneSubtasks = draft.subtasks.filter((st) => st.done).length;

  // Anything already linked either way is left out, as is the task itself;
  // the API refuses those, and offering them just invites the error.
  const linkedIds = new Set([
    task.id,
    ...draft.blockedBy.map((d) => d.id),
    ...draft.blocks.map((d) => d.id),
  ]);
  const dependencyOptions = allTasks
    .filter((t) => !linkedIds.has(t.id))
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close task details"
        onClick={onClose}
        className="absolute inset-0 bg-black/55"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`${task.key}: ${task.title}`}
        className="relative flex h-full w-full max-w-lg flex-col border-l border-line bg-canvas shadow-2xl focus:outline-none"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {team ? <TeamDot colour={team.colour} /> : null}
            <span className="font-mono text-xs text-ink-3" translate="no">
              {task.key}
            </span>
            <StatusBadge status={draft.status} label={STATUS_LABEL[draft.status]} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-ink-3 transition-colors hover:bg-elevated hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M4.3 3.3a1 1 0 0 1 1.4 0L8 5.6l2.3-2.3a1 1 0 1 1 1.4 1.4L9.4 7l2.3 2.3a1 1 0 0 1-1.4 1.4L8 8.4l-2.3 2.3a1 1 0 0 1-1.4-1.4L6.6 7 4.3 4.7a1 1 0 0 1 0-1.4Z" />
            </svg>
          </button>
        </header>

        <div className="selectable overscroll-none-safe flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="space-y-1.5">
            <label className={LABEL} htmlFor="task-title">
              Title
            </label>
            <input
              id="task-title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              autoComplete="off"
              className={`${FIELD} text-base font-medium`}
            />
          </div>

          <div className="space-y-1.5">
            <label className={LABEL} htmlFor="task-description">
              Description
            </label>
            <textarea
              id="task-description"
              rows={3}
              value={draft.description ?? ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="What needs doing, and what counts as finished?"
              className={`${FIELD} resize-y leading-relaxed`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={LABEL} htmlFor="task-status">
                Status
              </label>
              <select
                id="task-status"
                value={draft.status}
                onChange={(e) =>
                  setDraft({ ...draft, status: e.target.value as TaskStatus })
                }
                className={FIELD}
              >
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className={LABEL} htmlFor="task-assignee">
                Assignee
              </label>
              <select
                id="task-assignee"
                value={draft.assigneeId ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, assigneeId: e.target.value || null })
                }
                className={FIELD}
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className={LABEL} htmlFor="task-planned-start">
                Planned start
              </label>
              <input
                id="task-planned-start"
                type="date"
                value={toDateInput(draft.plannedStart)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    plannedStart: e.target.value ? new Date(e.target.value) : null,
                  })
                }
                className={FIELD}
              />
            </div>

            <div className="space-y-1.5">
              <label className={LABEL} htmlFor="task-planned-end">
                Planned end
              </label>
              <input
                id="task-planned-end"
                type="date"
                value={toDateInput(draft.plannedEnd)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    plannedEnd: e.target.value ? new Date(e.target.value) : null,
                  })
                }
                className={FIELD}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={LABEL} htmlFor="task-progress">
              Progress &mdash; <span className="tabular-nums">{draft.progress}%</span>
            </label>
            <input
              id="task-progress"
              type="range"
              min={0}
              max={100}
              step={5}
              value={draft.progress}
              onChange={(e) => {
                const progress = Number(e.target.value);
                // Sliding to 100% is how most people mark something finished,
                // so move it to Done rather than leaving the two disagreeing.
                setDraft({
                  ...draft,
                  progress,
                  status:
                    progress === 100
                      ? "DONE"
                      : draft.status === "DONE"
                        ? "IN_PROGRESS"
                        : draft.status,
                });
              }}
              className="w-full accent-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <ProgressBar value={draft.progress} colour={team?.colour} />
          </div>

          <section className="space-y-2">
            <h3 className={LABEL}>Links</h3>
            {draft.links.length > 0 ? (
              <ul className="space-y-1">
                {draft.links.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center gap-2 rounded-md bg-panel px-2.5 py-1.5"
                  >
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate rounded text-xs text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {link.label}
                    </a>
                    <button
                      type="button"
                      onClick={() => removeLink(link.id)}
                      aria-label={`Remove link ${link.label}`}
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

            {/* The URL gets a row of its own: it is the long value, and sharing
                one row with the label left neither enough room to read. */}
            <form onSubmit={addLink} className="space-y-2">
              <label className="sr-only" htmlFor="link-url">
                Link address
              </label>
              <input
                id="link-url"
                type="url"
                inputMode="url"
                spellCheck={false}
                autoComplete="off"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://drive.google.com/…"
                className={`${FIELD} text-xs`}
              />
              <div className="flex gap-2">
                <label className="sr-only" htmlFor="link-label">
                  Link label
                </label>
                <input
                  id="link-label"
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  autoComplete="off"
                  placeholder="Label (optional)"
                  className={`${FIELD} text-xs`}
                />
                <button
                  type="submit"
                  disabled={!linkUrl.trim()}
                  className="shrink-0 rounded-md border border-line px-3 text-xs text-ink-2 transition-colors hover:bg-elevated hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Add Link
                </button>
              </div>
            </form>
          </section>

          <Disclosure title="More details">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={LABEL} htmlFor="task-workstream">
                  Workstream
                </label>
                <select
                  id="task-workstream"
                  value={draft.workstreamId ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, workstreamId: e.target.value || null })
                  }
                  className={FIELD}
                >
                  <option value="">Ungrouped</option>
                  {teamWorkstreams.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code ? `${w.code} ${w.name}` : w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className={LABEL} htmlFor="task-priority">
                  Priority
                </label>
                <select
                  id="task-priority"
                  value={draft.priority}
                  onChange={(e) =>
                    setDraft({ ...draft, priority: e.target.value as TaskPriority })
                  }
                  className={FIELD}
                >
                  {TASK_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {PRIORITY_LABEL[priority]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className={LABEL} htmlFor="task-milestone">
                  Milestone
                </label>
                <select
                  id="task-milestone"
                  value={draft.milestoneId ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, milestoneId: e.target.value || null })
                  }
                  className={FIELD}
                >
                  <option value="">None</option>
                  {milestones.map((milestone) => (
                    <option key={milestone.id} value={milestone.id}>
                      {milestone.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className={LABEL} htmlFor="task-owner-label">
                  Owner (as written)
                </label>
                <input
                  id="task-owner-label"
                  value={draft.ownerLabel ?? ""}
                  onChange={(e) => setDraft({ ...draft, ownerLabel: e.target.value })}
                  autoComplete="off"
                  placeholder="e.g. Owen &amp; Jack"
                  className={FIELD}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={LABEL} htmlFor="task-notes">
                Notes
              </label>
              <textarea
                id="task-notes"
                rows={2}
                value={draft.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                className={`${FIELD} resize-y`}
              />
            </div>
          </Disclosure>

          {scheduled ? (
            <Disclosure
              title="Schedule"
              badge={
                scheduled.planVarianceDays !== null && scheduled.planVarianceDays > 0
                  ? `${scheduled.planVarianceDays}d late`
                  : undefined
              }
            >
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-3">Can start</dt>
                  <dd className="tabular-nums">{format(scheduled.earliestStart, "d MMM")}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-3">Forecast finish</dt>
                  <dd className="tabular-nums">{format(scheduled.earliestFinish, "d MMM")}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-3">Must finish by</dt>
                  <dd className="tabular-nums">{format(scheduled.latestFinish, "d MMM")}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-3">Float</dt>
                  <dd
                    className={
                      scheduled.slackDays < 0
                        ? "font-medium tabular-nums text-danger"
                        : "tabular-nums text-ink-2"
                    }
                  >
                    {formatDays(-scheduled.slackDays)}
                  </dd>
                </div>
              </dl>
              {scheduled.planVarianceDays === null ? (
                <p className="text-xs text-warning">
                  No planned end date, so this task is invisible to the forecast.
                </p>
              ) : null}
              {scheduled.isCritical ? (
                <p className="text-xs text-accent">
                  On the critical path — any slip moves the whole project.
                </p>
              ) : null}
              <Link
                href={`/impact?task=${task.id}`}
                className="inline-block rounded text-xs text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                What happens if this slips? &rarr;
              </Link>
            </Disclosure>
          ) : null}

          {/* Both sections are offered on every task, empty or not: a checklist
              you cannot start and a dependency you cannot record are the two
              things people gave up on this tool for. */}
          <Disclosure
            title="Dependencies"
            badge={
              draft.blockedBy.length + draft.blocks.length > 0
                ? `${draft.blockedBy.length + draft.blocks.length}`
                : undefined
            }
          >
            <div className="space-y-1.5">
              <p className="text-xs text-ink-2">Waiting on</p>
              {draft.blockedBy.length > 0 ? (
                <ul className="space-y-1">
                  {draft.blockedBy.map((dep) => (
                    <DependencyRow
                      key={dep.depId}
                      dep={dep}
                      teams={teams}
                      onRemove={() => removeDependency(dep.depId)}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-3">
                  Nothing yet &mdash; this task can start whenever.
                </p>
              )}
              <form onSubmit={addDependency} className="flex gap-2">
                <select
                  aria-label="Task this one waits on"
                  value={dependencyId}
                  onChange={(e) => setDependencyId(e.target.value)}
                  className={`${FIELD} text-xs`}
                >
                  <option value="">Add a task this one waits on…</option>
                  {dependencyOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.key} — {option.title}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={!dependencyId}
                  className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs text-ink-2 transition-colors hover:bg-elevated hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Add
                </button>
              </form>
            </div>

            {draft.blocks.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs text-ink-2">Blocking</p>
                <ul className="space-y-1">
                  {draft.blocks.map((dep) => (
                    <DependencyRow
                      key={dep.depId}
                      dep={dep}
                      teams={teams}
                      onRemove={() => removeDependency(dep.depId)}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </Disclosure>

          <Disclosure
            title="Checklist"
            badge={
              draft.subtasks.length > 0
                ? `${doneSubtasks}/${draft.subtasks.length}`
                : undefined
            }
          >
            {draft.subtasks.length > 0 ? (
              <ul className="space-y-0.5">
                {draft.subtasks.map((st) => (
                  <li key={st.id} className="group/st flex items-start gap-2">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded px-1 py-1 text-xs hover:bg-elevated">
                      <input
                        type="checkbox"
                        checked={st.done}
                        onChange={(e) => toggleSubtask(st.id, e.target.checked)}
                        className="mt-px h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--color-success)]"
                      />
                      <span className={st.done ? "text-ink-3 line-through" : ""}>
                        {st.title}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeSubtask(st.id)}
                      aria-label={`Remove "${st.title}"`}
                      className="mt-0.5 shrink-0 rounded p-1 text-ink-3 opacity-0 transition-opacity group-hover/st:opacity-100 hover:text-danger focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
                        <path d="M4.3 3.3 8 7l3.7-3.7 1 1L9 8l3.7 3.7-1 1L8 9l-3.7 3.7-1-1L7 8 3.3 4.3Z" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-3">No checklist items yet.</p>
            )}
            <form onSubmit={addSubtask} className="flex gap-2">
              <input
                value={subtaskTitle}
                onChange={(e) => setSubtaskTitle(e.target.value)}
                placeholder="Add a checklist item"
                aria-label="New checklist item"
                autoComplete="off"
                className={`${FIELD} text-xs`}
              />
              <button
                type="submit"
                disabled={!subtaskTitle.trim()}
                className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs text-ink-2 transition-colors hover:bg-elevated hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Add
              </button>
            </form>
          </Disclosure>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p aria-live="polite" className="min-w-0 flex-1 text-xs">
            {error ? (
              <span className="text-danger">{error}</span>
            ) : assignee ? (
              <span className="flex items-center gap-2 text-ink-3">
                <Avatar name={assignee.name} />
                <span className="truncate">{assignee.name}</span>
              </span>
            ) : (
              <span className="text-ink-3">Nobody assigned</span>
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-elevated hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-canvas transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function DependencyRow({
  dep,
  teams,
  onRemove,
}: {
  dep: { id: string; key: string; title: string; teamId: string };
  teams: TeamView[];
  onRemove?: () => void;
}) {
  const team = teams.find((t) => t.id === dep.teamId);
  return (
    <li className="group/dep flex items-center gap-2 rounded-md bg-elevated px-2.5 py-1.5 text-xs">
      {team ? <TeamDot colour={team.colour} /> : null}
      <span className="font-mono text-ink-3" translate="no">
        {dep.key}
      </span>
      <span className="min-w-0 flex-1 truncate">{dep.title}</span>
      {team ? (
        <span className="hidden shrink-0 text-ink-3 sm:inline">{team.name}</span>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove dependency on ${dep.key}`}
          className="-mr-1 shrink-0 rounded p-1 text-ink-3 opacity-0 transition-opacity group-hover/dep:opacity-100 hover:text-danger focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
            <path d="M4.3 3.3 8 7l3.7-3.7 1 1L9 8l3.7 3.7-1 1L8 9l-3.7 3.7-1-1L7 8 3.3 4.3Z" />
          </svg>
        </button>
      ) : null}
    </li>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  PRIORITY_LABEL,
  PROJECT_STAGES,
  STAGE_LABEL,
  STATUS_LABEL,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type ProjectStage,
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
  scheduled: ScheduledTask | undefined;
  onClose: () => void;
  onSaved: (task: TaskView) => void;
}

const FIELD =
  "w-full min-w-0 rounded-md border border-edge bg-surface-2 px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-info focus:outline-none focus-visible:ring-2 focus-visible:ring-info";
const LABEL = "block text-xs font-medium text-ink-muted";

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
    <details className="group rounded-lg border border-edge bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-info">
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform group-open:rotate-90"
          fill="currentColor"
        >
          <path d="M6 4l4 4-4 4V4Z" />
        </svg>
        <span className="flex-1">{title}</span>
        {badge ? (
          <span className="text-xs tabular-nums text-ink-faint">{badge}</span>
        ) : null}
      </summary>
      <div className="space-y-3 border-t border-edge-soft px-3 py-3">{children}</div>
    </details>
  );
}

export function TaskDrawer({
  task,
  teams,
  members,
  milestones,
  workstreams,
  scheduled,
  onClose,
  onSaved,
}: DrawerProps) {
  const [draft, setDraft] = useState(task);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
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
    draft.estimateDays !== task.estimateDays ||
    draft.progress !== task.progress ||
    draft.stage !== task.stage ||
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
          estimateDays: draft.estimateDays,
          progress: draft.status === "DONE" ? 100 : draft.progress,
          stage: draft.stage,
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

  const doneSubtasks = draft.subtasks.filter((st) => st.done).length;

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
        className="relative flex h-full w-full max-w-lg flex-col border-l border-edge bg-ground shadow-2xl focus:outline-none"
      >
        <header className="flex items-center justify-between gap-3 border-b border-edge px-5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {team ? <TeamDot colour={team.colour} /> : null}
            <span className="font-mono text-xs text-ink-faint" translate="no">
              {task.key}
            </span>
            <StatusBadge status={draft.status} label={STATUS_LABEL[draft.status]} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-info"
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
              className="w-full accent-[var(--color-mars)] focus:outline-none focus-visible:ring-2 focus-visible:ring-info"
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
                    className="flex items-center gap-2 rounded-md bg-surface px-2.5 py-1.5"
                  >
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate rounded text-xs text-info hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-info"
                    >
                      {link.label}
                    </a>
                    <button
                      type="button"
                      onClick={() => removeLink(link.id)}
                      aria-label={`Remove link ${link.label}`}
                      className="rounded p-0.5 text-ink-faint transition-colors hover:text-late focus:outline-none focus-visible:ring-2 focus-visible:ring-info"
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
                  className="shrink-0 rounded-md border border-edge px-3 text-xs text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-info"
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
                <label className={LABEL} htmlFor="task-stage">
                  Stage
                </label>
                <select
                  id="task-stage"
                  value={draft.stage ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stage: (e.target.value || null) as ProjectStage | null,
                    })
                  }
                  className={FIELD}
                >
                  <option value="">Not set</option>
                  {PROJECT_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {STAGE_LABEL[stage]}
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
                <label className={LABEL} htmlFor="task-estimate">
                  Estimate (days)
                </label>
                <input
                  id="task-estimate"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={365}
                  value={draft.estimateDays}
                  onChange={(e) =>
                    setDraft({ ...draft, estimateDays: Number(e.target.value) || 0 })
                  }
                  className={FIELD}
                />
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
                  <dt className="text-ink-faint">Can start</dt>
                  <dd className="tabular-nums">{format(scheduled.earliestStart, "d MMM")}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint">Forecast finish</dt>
                  <dd className="tabular-nums">{format(scheduled.earliestFinish, "d MMM")}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint">Must finish by</dt>
                  <dd className="tabular-nums">{format(scheduled.latestFinish, "d MMM")}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint">Float</dt>
                  <dd
                    className={
                      scheduled.slackDays < 0
                        ? "font-medium tabular-nums text-late"
                        : "tabular-nums text-ink-muted"
                    }
                  >
                    {formatDays(-scheduled.slackDays)}
                  </dd>
                </div>
              </dl>
              {scheduled.planVarianceDays === null ? (
                <p className="text-xs text-warn">
                  No planned end date, so this task is invisible to the forecast.
                </p>
              ) : null}
              {scheduled.isCritical ? (
                <p className="text-xs text-mars-soft">
                  On the critical path — any slip moves the whole project.
                </p>
              ) : null}
              <Link
                href={`/impact?task=${task.id}`}
                className="inline-block rounded text-xs text-info hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-info"
              >
                What happens if this slips? &rarr;
              </Link>
            </Disclosure>
          ) : null}

          {draft.blockedBy.length > 0 || draft.blocks.length > 0 ? (
            <Disclosure
              title="Dependencies"
              badge={`${draft.blockedBy.length + draft.blocks.length}`}
            >
              {draft.blockedBy.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-ink-muted">Waiting on</p>
                  <ul className="space-y-1">
                    {draft.blockedBy.map((dep) => (
                      <DependencyRow key={dep.id} dep={dep} teams={teams} />
                    ))}
                  </ul>
                </div>
              ) : null}
              {draft.blocks.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-ink-muted">Blocking</p>
                  <ul className="space-y-1">
                    {draft.blocks.map((dep) => (
                      <DependencyRow key={dep.id} dep={dep} teams={teams} />
                    ))}
                  </ul>
                </div>
              ) : null}
            </Disclosure>
          ) : null}

          {draft.subtasks.length > 0 ? (
            <Disclosure
              title="Checklist"
              badge={`${doneSubtasks}/${draft.subtasks.length}`}
            >
              <ul className="space-y-1">
                {draft.subtasks.map((st) => (
                  <li key={st.id} className="flex items-start gap-2 text-xs">
                    <span
                      aria-hidden
                      className={
                        st.done
                          ? "mt-0.5 inline-block h-3 w-3 shrink-0 rounded-sm bg-ok"
                          : "mt-0.5 inline-block h-3 w-3 shrink-0 rounded-sm ring-1 ring-edge"
                      }
                    />
                    <span className={st.done ? "text-ink-faint line-through" : ""}>
                      {st.title}
                    </span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-edge px-5 py-3">
          <p aria-live="polite" className="min-w-0 flex-1 text-xs">
            {error ? (
              <span className="text-late">{error}</span>
            ) : assignee ? (
              <span className="flex items-center gap-2 text-ink-faint">
                <Avatar name={assignee.name} />
                <span className="truncate">{assignee.name}</span>
              </span>
            ) : (
              <span className="text-ink-faint">Nobody assigned</span>
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-info"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-md bg-mars px-3 py-1.5 text-sm font-medium text-ground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-info"
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
}: {
  dep: { id: string; key: string; title: string; teamId: string };
  teams: TeamView[];
}) {
  const team = teams.find((t) => t.id === dep.teamId);
  return (
    <li className="flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs">
      {team ? <TeamDot colour={team.colour} /> : null}
      <span className="font-mono text-ink-faint" translate="no">
        {dep.key}
      </span>
      <span className="min-w-0 flex-1 truncate">{dep.title}</span>
      {team ? <span className="shrink-0 text-ink-faint">{team.name}</span> : null}
    </li>
  );
}

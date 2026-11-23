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
import { behindPlanDays, type ScheduledTask } from "@/lib/schedule";
import { behindPlanReason, expectedReason, spareTimeLabel, spareTimeReason } from "./schedule-words";
import { AssigneePicker } from "./AssigneePicker";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { ConfirmDialog } from "./ConfirmDialog";
import { AvatarStack, PRIORITY_COLOUR, PriorityPill, ProgressBar, StatusBadge, TeamDot } from "./ui";
import { NO_PENDING, rebaseDraft, refusal, type PendingChanges } from "./task-draft";

interface DrawerProps {
  canEdit: boolean;
  task: TaskView;
  teams: TeamView[];
  members: MemberView[];
  milestones: MilestoneView[];
  workstreams: WorkstreamView[];
  /** Every task on the board, so this one can be made to wait on another. */
  allTasks: TaskView[];
  scheduled: ScheduledTask | undefined;
  onClose: () => void;
  /** Save pressed and accepted: the task as saved. */
  onSaved: (task: TaskView) => void;
  /**
   * A checklist item, link or dependency the server has accepted, as a change
   * to apply to the board's own copy of the task. A change rather than a
   * whole task, so unsaved field edits in the panel never reach the board,
   * and two changes finishing together cannot undo one another.
   */
  onChanged?: (taskId: string, change: (current: TaskView) => TaskView) => void;
  /** Choosing Blocked: the board asks why and what on (see BlockDialog). */
  onBlock?: () => void;
  /**
   * The task is gone from the database; the drawer is about to close. Left
   * out for people who may not delete tasks, which hides the Delete button.
   */
  onDeleted?: (task: TaskView) => void;
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
  canEdit,
  task,
  teams,
  members,
  milestones,
  workstreams,
  allTasks,
  scheduled,
  onClose,
  onSaved,
  onChanged,
  onBlock,
  onDeleted,
}: DrawerProps) {
  const [draft, setDraft] = useState(task);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [dependencyId, setDependencyId] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  // Checklist, link and dependency changes on their way to the server. They
  // show at once, and survive the board reloading before they have landed.
  const [pending, setPending] = useState<PendingChanges>(NO_PENDING);
  // One request at a time per item, in the order they were made: ticking and
  // unticking quickly must not arrive at the server the other way round.
  const queues = useRef(new Map<string, Promise<void>>());
  function inTurn(id: string, run: () => Promise<void>): Promise<void> {
    const next = (queues.current.get(id) ?? Promise.resolve()).then(run, run);
    queues.current.set(id, next);
    return next;
  }

  const [seenTask, setSeenTask] = useState(task);
  if (task !== seenTask) {
    setSeenTask(task);
    setDraft(rebaseDraft(draft, seenTask, task, pending));
  }

  /** Tell the board about a change the server has accepted. */
  function confirmed(change: (current: TaskView) => TaskView) {
    if (onChanged) onChanged(task.id, change);
    else onSaved(change(task));
  }

  /** Send a change; the response, or null when it never arrived. */
  async function send(url: string, method: string, body?: unknown): Promise<Response | null> {
    try {
      return await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      return null;
    }
  }

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
  const assigned = draft.assigneeIds
    .map((assigneeId) => members.find((m) => m.id === assigneeId))
    .filter((m): m is MemberView => Boolean(m));

  const dirty =
    draft.title !== task.title ||
    draft.description !== task.description ||
    draft.status !== task.status ||
    draft.priority !== task.priority ||
    !sameMembers(draft.assigneeIds, task.assigneeIds) ||
    draft.milestoneId !== task.milestoneId ||
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
          assigneeIds: draft.assigneeIds,
          milestoneId: draft.milestoneId,
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
      onSaved(draft);
      onClose();
    } catch (cause) {
      console.error("Failed to save task", cause);
      setError("Could not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  /*
   * The server records the task's key as it deletes it, which is what tells
   * the Google Sheets sync to remove the task's row rather than read the row
   * back in as a new task -- and keeps the key from ever being reissued.
   */
  async function deleteTask() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      // 404: already deleted, from the sheet or another tab. Same end state.
      if (!response.ok && response.status !== 404) {
        const body = await response.json().catch(() => null);
        setDeleteError(
          response.status === 403 && body?.error
            ? body.error
            : "Could not delete the task. Check your connection and try again.",
        );
        return;
      }
      setConfirmingDelete(false);
      onDeleted?.(task);
    } catch (cause) {
      console.error("Failed to delete task", cause);
      setDeleteError("Could not delete the task. Check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  }

  function cancelDelete() {
    setConfirmingDelete(false);
    setDeleteError(null);
    deleteButtonRef.current?.focus();
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
    const response = await send(`/api/tasks/${task.id}/links`, "POST", { label, url: linkUrl.trim() });
    if (!response?.ok) {
      setError(
        response?.status === 400 ? "Links must start with http:// or https://" : await refusal(response, "that link"),
      );
      return;
    }
    const created = await response.json();
    const link = { id: created.id, label: created.label, url: created.url };
    setDraft((d) => ({ ...d, links: [...d.links, link] }));
    confirmed((t) => ({ ...t, links: [...t.links, link] }));
    setLinkLabel("");
    setLinkUrl("");
    setError(null);
  }

  function removeLink(linkId: string) {
    const link = draft.links.find((l) => l.id === linkId);
    if (!link) return;
    setPending((p) => ({ ...p, removed: [...p.removed, linkId] }));
    setDraft((d) => ({ ...d, links: d.links.filter((l) => l.id !== linkId) }));
    void inTurn(linkId, async () => {
      const response = await send(`/api/links/${linkId}`, "DELETE");
      setPending((p) => ({ ...p, removed: p.removed.filter((id) => id !== linkId) }));
      // 404: gone already, which is what was wanted.
      if (response?.ok || response?.status === 404) {
        confirmed((t) => ({ ...t, links: t.links.filter((l) => l.id !== linkId) }));
        return;
      }
      setDraft((d) => ({ ...d, links: [...d.links, link] }));
      setError(await refusal(response, "that change"));
    });
  }

  async function addSubtask(event: React.FormEvent) {
    event.preventDefault();
    const title = subtaskTitle.trim();
    if (!title) return;
    const response = await send(`/api/tasks/${task.id}/subtasks`, "POST", { title });
    if (!response?.ok) {
      setError(await refusal(response, "that checklist item"));
      return;
    }
    const created = await response.json();
    const item = { id: created.id, title: created.title, done: created.done };
    setDraft((d) => ({ ...d, subtasks: [...d.subtasks, item] }));
    confirmed((t) => ({ ...t, subtasks: [...t.subtasks, item] }));
    setSubtaskTitle("");
    setError(null);
  }

  /*
   * Ticked on screen at once; the board hears of it only once the server has
   * it. Telling the board first had it reload the task from the server while
   * the tick was still on its way -- and put the old, unticked list back.
   */
  function toggleSubtask(subtaskId: string, done: boolean) {
    const tick = (list: TaskView["subtasks"], value: boolean) =>
      list.map((st) => (st.id === subtaskId ? { ...st, done: value } : st));
    setPending((p) => ({ ...p, done: { ...p.done, [subtaskId]: done } }));
    setDraft((d) => ({ ...d, subtasks: tick(d.subtasks, done) }));
    void inTurn(subtaskId, async () => {
      const response = await send(`/api/subtasks/${subtaskId}`, "PATCH", { done });
      // Still pending only if a later tick on the same item replaced this one.
      setPending((p) => {
        if (p.done[subtaskId] !== done) return p;
        const rest = { ...p.done };
        delete rest[subtaskId];
        return { ...p, done: rest };
      });
      if (response?.ok) {
        confirmed((t) => ({ ...t, subtasks: tick(t.subtasks, done) }));
        return;
      }
      setDraft((d) => ({ ...d, subtasks: tick(d.subtasks, !done) }));
      setError(await refusal(response, "that tick"));
    });
  }

  function removeSubtask(subtaskId: string) {
    const index = draft.subtasks.findIndex((st) => st.id === subtaskId);
    if (index < 0) return;
    const item = draft.subtasks[index];
    setPending((p) => ({ ...p, removed: [...p.removed, subtaskId] }));
    setDraft((d) => ({ ...d, subtasks: d.subtasks.filter((st) => st.id !== subtaskId) }));
    void inTurn(subtaskId, async () => {
      const response = await send(`/api/subtasks/${subtaskId}`, "DELETE");
      setPending((p) => ({ ...p, removed: p.removed.filter((id) => id !== subtaskId) }));
      if (response?.ok || response?.status === 404) {
        confirmed((t) => ({ ...t, subtasks: t.subtasks.filter((st) => st.id !== subtaskId) }));
        return;
      }
      setDraft((d) => {
        const list = [...d.subtasks];
        list.splice(Math.min(index, list.length), 0, item);
        return { ...d, subtasks: list };
      });
      setError(await refusal(response, "that change to the checklist"));
    });
  }

  async function addDependency(event: React.FormEvent) {
    event.preventDefault();
    if (!dependencyId) return;
    const response = await send(`/api/tasks/${task.id}/dependencies`, "POST", { predecessorId: dependencyId });
    if (!response?.ok) {
      // The API explains a refused link (a loop, a duplicate); it is more
      // useful than anything this component could guess.
      const body = response?.status === 400 || response?.status === 409 ? await response.json().catch(() => null) : null;
      setError(body?.error ?? (await refusal(response, "that dependency")));
      return;
    }
    const created = await response.json();
    const predecessor = allTasks.find((t) => t.id === dependencyId);
    if (predecessor) {
      const dep = {
        depId: created.id,
        id: predecessor.id,
        key: predecessor.key,
        title: predecessor.title,
        teamId: predecessor.teamId,
      };
      setDraft((d) => ({ ...d, blockedBy: [...d.blockedBy, dep] }));
      confirmed((t) => ({ ...t, blockedBy: [...t.blockedBy, dep] }));
    }
    setDependencyId("");
    setError(null);
  }

  function removeDependency(depId: string) {
    const before = { blockedBy: draft.blockedBy, blocks: draft.blocks };
    const without = <T extends { blockedBy: TaskView["blockedBy"]; blocks: TaskView["blocks"] }>(t: T): T => ({
      ...t,
      blockedBy: t.blockedBy.filter((d) => d.depId !== depId),
      blocks: t.blocks.filter((d) => d.depId !== depId),
    });
    setPending((p) => ({ ...p, removed: [...p.removed, depId] }));
    setDraft(without);
    void inTurn(depId, async () => {
      const response = await send(`/api/dependencies/${depId}`, "DELETE");
      setPending((p) => ({ ...p, removed: p.removed.filter((id) => id !== depId) }));
      if (response?.ok || response?.status === 404) {
        confirmed(without);
        return;
      }
      setDraft((d) => ({ ...d, ...before }));
      setError(await refusal(response, "that change"));
    });
  }

  const doneSubtasks = draft.subtasks.filter((st) => st.done).length;

  // Blocking; see src/lib/blocking.ts.
  const blockedByName = task.blockedByMemberId
    ? members.find((m) => m.id === task.blockedByMemberId)?.name
    : undefined;
  const waitingOn = task.blockedBy
    .filter((d) => d.blocking)
    .map((d) => {
      const other = allTasks.find((t) => t.id === d.id);
      return { ...d, status: other?.status, priority: other?.priority };
    });
  const holdingUp =
    task.status === "DONE" || task.status === "IN_REVIEW" ? [] : task.blocks.filter((d) => d.blocking);

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
          <div className="flex shrink-0 items-center gap-1">
            {canEdit && onDeleted ? (
              <button
                ref={deleteButtonRef}
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ink-3 transition-colors hover:bg-danger/10 hover:text-danger focus:outline-none focus-visible:text-danger focus-visible:ring-2 focus-visible:ring-danger"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M2.5 4.5h11M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4 4.5l.6 8.6a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.6M6.75 7v4.5M9.25 7v4.5" />
                </svg>
                Delete
              </button>
            ) : null}
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
          </div>
        </header>

        <fieldset
          disabled={!canEdit}
          aria-label={canEdit ? "Edit task" : "Read-only task details"}
          className="selectable overscroll-none-safe min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto border-0 px-5 py-5"
        >
          {!canEdit ? <p className="text-xs text-ink-3">Read-only. Sign in to edit this task.</p> : null}
          {/* Opening a flagged task should answer "why is this flagged?"
              before anything else on the screen. */}
          {draft.flagged || task.status === "BLOCKED" ? (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-medium text-danger">
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                  <path d="M3.75 2v12M3.75 3h7.7a.6.6 0 0 1 .47.97L10.4 6.2a.5.5 0 0 0 0 .6l1.52 2.23a.6.6 0 0 1-.47.97h-7.7" />
                </svg>
                {task.status === "BLOCKED" ? "Blocked" : "Flagged"}
                {task.status === "BLOCKED" && blockedByName ? ` by ${blockedByName}` : ""}
              </p>
              <p className="mt-1 text-sm text-ink-2 text-pretty">
                {draft.flagReason || "No reason was given."}
              </p>
              {task.status === "BLOCKED" && waitingOn.length > 0 ? (
                <div className="mt-2.5 space-y-1.5">
                  <p className="text-xs text-ink-2">Waiting on</p>
                  <ul className="space-y-1">
                    {waitingOn.map((b) => (
                      <li key={b.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className="font-mono text-ink-3" translate="no">{b.key}</span>
                        <span className="min-w-0 flex-1 truncate text-ink">{b.title}</span>
                        {b.status ? <span className="text-ink-3">{STATUS_LABEL[b.status]}</span> : null}
                        {b.priority ? <PriorityPill priority={b.priority} /> : null}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-ink-3 text-pretty">
                    When {waitingOn.length === 1 ? "it is" : "these are all"} Done or In review, this task goes back to In
                    progress by itself.
                  </p>
                </div>
              ) : task.status === "BLOCKED" ? (
                <p className="mt-2 text-[11px] text-ink-3 text-pretty">
                  Nothing is recorded as blocking it, so it stays Blocked until someone moves it on.
                </p>
              ) : null}
              {task.status === "BLOCKED" && onBlock ? (
                <button
                  type="button"
                  onClick={onBlock}
                  className="mt-2 rounded text-xs font-medium text-danger hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {waitingOn.length === 0 ? "+ Add what it is waiting on" : "+ Add another task it is waiting on"}
                </button>
              ) : null}
            </div>
          ) : null}

          {holdingUp.length > 0 ? (
            <div
              className="rounded-lg border px-3 py-2.5"
              style={{
                borderColor: `color-mix(in srgb, ${PRIORITY_COLOUR[task.priority]} 55%, transparent)`,
                backgroundColor: `color-mix(in srgb, ${PRIORITY_COLOUR[task.priority]} 9%, transparent)`,
              }}
            >
              <p className="text-xs font-medium" style={{ color: PRIORITY_COLOUR[task.priority] }}>
                Blocking {holdingUp.length === 1 ? "another task" : `${holdingUp.length} tasks`} &middot;{" "}
                {PRIORITY_LABEL[task.priority]} priority
              </p>
              <ul className="mt-1.5 space-y-1">
                {holdingUp.map((b) => (
                  <li key={b.id} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-ink-3" translate="no">{b.key}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{b.title}</span>
                    <span className="shrink-0 text-ink-3">{teams.find((t) => t.id === b.teamId)?.name}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-ink-3 text-pretty">
                When this is Done or In review, {holdingUp.length === 1 ? "it goes" : "they go"} back to In progress
                by itself, and the people on {holdingUp.length === 1 ? "it" : "them"} are told.
              </p>
            </div>
          ) : null}

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
            <AutoGrowTextarea
              id="task-description"
              rows={3}
              value={draft.description ?? ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="What needs doing, and what counts as finished?"
              className={`${FIELD} leading-relaxed`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className={LABEL} htmlFor="task-status">
                Status
              </label>
              <select
                id="task-status"
                value={draft.status}
                onChange={(e) => {
                  const status = e.target.value as TaskStatus;
                  // Blocking asks why and what on, in its own dialog; the
                  // task only becomes Blocked once that is answered.
                  if (status === "BLOCKED" && task.status !== "BLOCKED" && onBlock) onBlock();
                  else setDraft({ ...draft, status });
                }}
                className={FIELD}
              >
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <AssigneePicker
                id="task-assignees"
                members={members}
                teams={teams}
                teamId={draft.teamId}
                value={draft.assigneeIds}
                onChange={(assigneeIds) => setDraft({ ...draft, assigneeIds })}
                readOnly={!canEdit}
              />
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

          {/* The checklist is where the work of a task is tracked, and the
              only thing that moves its progress, so it sits in the body of
              the panel rather than behind More details. */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className={LABEL}>Checklist</h3>
              {draft.subtasks.length > 0 ? (
                <span className="text-xs tabular-nums text-ink-3">
                  {doneSubtasks} of {draft.subtasks.length} done
                </span>
              ) : null}
            </div>
            {draft.subtasks.length > 0 ? (
              <ProgressBar
                value={Math.round((doneSubtasks / draft.subtasks.length) * 100)}
                colour={team?.colour}
              />
            ) : null}
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
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => removeSubtask(st.id)}
                      aria-label={`Remove "${st.title}"`}
                      className="mt-0.5 shrink-0 rounded p-1 text-ink-3 transition-opacity [@media(hover:hover)]:opacity-0 group-hover/st:opacity-100 hover:text-danger focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
                        <path d="M4.3 3.3 8 7l3.7-3.7 1 1L9 8l3.7 3.7-1 1L8 9l-3.7 3.7-1-1L7 8 3.3 4.3Z" />
                      </svg>
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-3">No checklist items yet.</p>
          )}
          {canEdit ? (
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
          ) : null}
          </section>

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
                    {canEdit ? (
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
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : canEdit ? null : (
              <p className="text-xs text-ink-3">No links.</p>
            )}

            {/* The URL gets a row of its own: it is the long value, and sharing
                one row with the label left neither enough room to read. */}
            {canEdit ? (
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
            ) : null}
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
                  Other owners
                </label>
                <input
                  id="task-owner-label"
                  value={draft.ownerLabel ?? ""}
                  onChange={(e) => setDraft({ ...draft, ownerLabel: e.target.value })}
                  autoComplete="off"
                  placeholder="A group, e.g. Executive Team"
                  className={FIELD}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={LABEL} htmlFor="task-notes">
                Notes
              </label>
              <AutoGrowTextarea
                id="task-notes"
                rows={2}
                value={draft.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                className={FIELD}
              />
            </div>
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
                        onRemove={canEdit ? () => removeDependency(dep.depId) : undefined}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-ink-3">
                    Nothing yet &mdash; this task can start whenever.
                  </p>
                )}
                {canEdit ? (
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
                ) : null}
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
                        onRemove={canEdit ? () => removeDependency(dep.depId) : undefined}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </Disclosure>
          </Disclosure>

          {scheduled ? (
            <Disclosure
              title="Schedule"
              badge={
                behindPlanDays(scheduled) > 0 && task.status !== "DONE"
                  ? `${behindPlanDays(scheduled)} days behind`
                  : scheduled.isCritical
                    ? "No spare time"
                    : undefined
              }
            >
              {/* Each number with where it comes from: see schedule-words.ts,
                  and the rules at the top of lib/schedule.ts. */}
              <dl className="space-y-3 text-xs">
                <ScheduleRow
                  label="Planned"
                  value={
                    task.plannedStart && task.plannedEnd
                      ? `${format(task.plannedStart, "d MMM")} – ${format(task.plannedEnd, "d MMM")}`
                      : task.plannedEnd
                        ? `By ${format(task.plannedEnd, "d MMM")}`
                        : "No dates set"
                  }
                  reason={task.plannedEnd ? "The dates set on this task." : "With no planned end date it can't be behind plan."}
                  tone={task.plannedEnd ? undefined : "warning"}
                />
                {task.status === "DONE" ? null : (
                  <>
                    <ScheduleRow
                      label="Expected"
                      value={`${format(scheduled.earliestStart, "d MMM")} – ${format(scheduled.earliestFinish, "d MMM")}`}
                      reason={expectedReason(scheduled, task.plannedEnd, (id) => allTasks.find((t) => t.id === id))}
                    />
                    {scheduled.planVarianceDays !== null ? (
                      <ScheduleRow
                        label="Behind plan"
                        value={behindPlanDays(scheduled) > 0 ? `${behindPlanDays(scheduled)} days` : "No"}
                        reason={behindPlanReason(scheduled.planVarianceDays)}
                        tone={behindPlanDays(scheduled) > 0 ? "danger" : undefined}
                      />
                    ) : null}
                    <ScheduleRow
                      label="Spare time"
                      value={spareTimeLabel(scheduled.slackDays)}
                      reason={spareTimeReason(
                        scheduled,
                        (id) => allTasks.find((t) => t.id === id),
                        (id) => milestones.find((m) => m.id === id)?.name,
                      )}
                      tone={scheduled.slackDays < 0 ? "danger" : scheduled.slackDays === 0 ? "accent" : undefined}
                    />
                  </>
                )}
              </dl>
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

        </fieldset>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p aria-live="polite" className="min-w-0 flex-1 text-xs">
            {error ? (
              <span className="text-danger">{error}</span>
            ) : assigned.length > 0 ? (
              <span className="flex items-center gap-2 text-ink-3">
                <AvatarStack names={assigned.map((m) => m.name)} />
                <span className="truncate">
                  {assigned.length === 1
                    ? assigned[0].name
                    : `${assigned[0].name} + ${assigned.length - 1} more`}
                </span>
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
              {canEdit ? "Cancel" : "Close"}
            </button>
            {canEdit ? <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-canvas transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button> : null}
          </div>
        </footer>
      </div>

      {confirmingDelete ? (
        <ConfirmDialog
          title="Delete this task?"
          subtitle={
            <>
              <span className="font-mono" translate="no">
                {task.key}
              </span>{" "}
              &middot; {task.title}
            </>
          }
          confirmLabel="Delete Task"
          busyLabel="Deleting…"
          busy={deleting}
          error={deleteError}
          onCancel={cancelDelete}
          onConfirm={deleteTask}
        >
          <p>
            It is removed from the board and the timeline for everyone, along
            with its checklist, links and dependencies. Its row in the Google
            Sheet is removed too.
          </p>
          {task.blocks.length > 0 ? (
            <p>
              {task.blocks.length === 1
                ? "1 task is waiting on this one; it will no longer wait."
                : `${task.blocks.length} tasks are waiting on this one; they will no longer wait.`}
            </p>
          ) : null}
          <p className="font-medium text-ink">This cannot be undone.</p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

function ScheduleRow({
  label,
  value,
  reason,
  tone,
}: {
  label: string;
  value: string;
  reason: string;
  tone?: "danger" | "warning" | "accent";
}) {
  // One group per row, as a <dl> allows: the label, its value, and the
  // reason under both.
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3">
      <dt className="text-ink-2">{label}</dt>
      <dd
        className={
          tone === "danger"
            ? "text-right font-medium tabular-nums text-danger"
            : tone === "warning"
              ? "text-right font-medium text-warning"
              : tone === "accent"
                ? "text-right font-medium text-accent"
                : "text-right font-medium tabular-nums text-ink"
        }
      >
        {value}
      </dd>
      <dd className="col-span-2 mt-0.5 text-[11px] leading-snug text-ink-3 text-pretty">{reason}</dd>
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
          className="-mr-1 shrink-0 rounded p-1 text-ink-3 transition-opacity [@media(hover:hover)]:opacity-0 group-hover/dep:opacity-100 hover:text-danger focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
            <path d="M4.3 3.3 8 7l3.7-3.7 1 1L9 8l3.7 3.7-1 1L8 9l-3.7 3.7-1-1L7 8 3.3 4.3Z" />
          </svg>
        </button>
      ) : null}
    </li>
  );
}

/** The same people, in any order. */
function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

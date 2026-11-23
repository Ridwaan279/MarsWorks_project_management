"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { PRIORITY_LABEL, TASK_PRIORITIES, type TaskPriority, type TaskStatus } from "@/lib/domain";
import type { MemberView, TaskView, TeamView } from "@/lib/project";
import { AssigneePicker } from "./AssigneePicker";
import { PRIORITY_COLOUR } from "./ui";

/** What a task can be blocked on: a task made here, or one that exists. */
type Blocker =
  | { kind: "new"; key: number; title: string; teamId: string; priority: TaskPriority; assigneeIds: string[] }
  | { kind: "existing"; key: number; taskId: string };

const FIELD =
  "w-full min-w-0 rounded-md border border-line bg-elevated px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const LABEL = "block text-xs font-medium text-ink-2";

/** Done and In review clear a block, so they cannot be what one waits on. */
const CLEARED: TaskStatus[] = ["DONE", "IN_REVIEW"];

/**
 * Moving a task to Blocked asks why, and what it is waiting on: a new task
 * for whatever needs doing (with a priority saying how urgent it is, and the
 * people who will do it), or a task that already exists. The task goes back
 * to In progress by itself once all of them are Done or In review; see
 * src/lib/blocking.ts. Cancelling leaves the task where it was.
 */
export function BlockDialog({
  task,
  teams,
  members,
  allTasks,
  onCancel,
  onBlocked,
}: {
  task: TaskView;
  teams: TeamView[];
  members: MemberView[];
  allTasks: TaskView[];
  onCancel: () => void;
  onBlocked: () => void;
}) {
  const blankWith = (key: number): Blocker => ({
    kind: "new",
    key,
    title: "",
    teamId: task.teamId,
    priority: "MEDIUM",
    assigneeIds: [],
  });
  // Keys for blockers added later; the first is 0.
  const nextKey = useRef(1);
  const blank = () => blankWith(nextKey.current++);
  // Already Blocked: this adds to what it waits on, and can reword the reason.
  const already = task.status === "BLOCKED";
  const [reason, setReason] = useState(task.flagReason ?? "");
  const [blockers, setBlockers] = useState<Blocker[]>(() => [blankWith(0)]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    reasonRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Above the task panel: Escape closes this, not both.
        event.stopImmediatePropagation();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const update = (key: number, change: Partial<Blocker>) =>
    setBlockers((list) => list.map((b) => (b.key === key ? ({ ...b, ...change } as Blocker) : b)));

  const chosen = new Set(blockers.flatMap((b) => (b.kind === "existing" ? [b.taskId] : [])));
  const candidates = allTasks
    .filter(
      (t) =>
        t.id !== task.id &&
        !CLEARED.includes(t.status) &&
        // Already waited on: nothing to add.
        !task.blockedBy.some((d) => d.id === t.id && d.blocking),
    )
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason.trim()) return setError("Say why it is blocked.");
    for (const b of blockers) {
      if (b.kind === "new" && !b.title.trim()) return setError("Give each new task a title.");
      if (b.kind === "existing" && !b.taskId) return setError("Choose the task it is waiting on, or remove that line.");
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim(),
          blockers: blockers.map((b) =>
            b.kind === "new"
              ? { kind: "new", title: b.title.trim(), teamId: b.teamId, priority: b.priority, assigneeIds: b.assigneeIds }
              : { kind: "existing", taskId: b.taskId },
          ),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Could not block that task. Try again in a moment.");
        return;
      }
      onBlocked();
    } catch {
      setError("Could not block that task: check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="block-heading" className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
      <button type="button" aria-label="Cancel" onClick={onCancel} className="absolute inset-0 bg-black/55" />
      <form
        onSubmit={submit}
        // Typing a fix clears the last complaint rather than leaving it up.
        onChange={() => setError(null)}
        className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col rounded-xl border border-line bg-panel shadow-2xl shadow-black/40"
      >
        <div className="space-y-1 border-b border-line px-4 py-3">
          <h2 id="block-heading" className="text-sm font-semibold text-danger">
            {already ? "Add what it is waiting on" : "Block this task"}
          </h2>
          <p className="truncate text-xs text-ink-3">
            <span className="font-mono" translate="no">{task.key}</span> &middot; {task.title}
          </p>
        </div>

        <div className="selectable min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <div className="space-y-1.5">
            <label htmlFor="block-reason" className={LABEL}>
              Why is it blocked?
            </label>
            <textarea
              ref={reasonRef}
              id="block-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              required
              placeholder="e.g. Can't test until the motor drivers arrive"
              className={`${FIELD} resize-y`}
            />
            <p className="text-[11px] text-ink-3">The task is flagged with this, so everyone can see why.</p>
          </div>

          <fieldset className="space-y-2">
            <legend className={LABEL}>What is it waiting on?</legend>
            <p className="text-[11px] text-ink-3 text-pretty">
              Add the task, or tasks, that have to happen first. Their sub-team&apos;s lead is told, with
              the priority. When they are all Done or In review, this task goes back to In progress by itself.
            </p>

            {blockers.map((b, i) => (
              <div
                key={b.key}
                className="space-y-2.5 rounded-lg border bg-canvas p-3"
                style={{ borderColor: b.kind === "new" ? `color-mix(in srgb, ${PRIORITY_COLOUR[b.priority]} 60%, var(--color-border))` : undefined }}
              >
                <div className="flex items-center gap-2">
                  <div role="group" aria-label={`Blocker ${i + 1}`} className="flex rounded-md border border-line p-0.5 text-xs">
                    {(["new", "existing"] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        aria-pressed={b.kind === kind}
                        onClick={() =>
                          setBlockers((list) =>
                            list.map((x) =>
                              x.key !== b.key || x.kind === kind
                                ? x
                                : kind === "new"
                                  ? blankWith(x.key)
                                  : { kind: "existing", key: x.key, taskId: "" },
                            ),
                          )
                        }
                        className={clsx(
                          "rounded px-2.5 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                          b.kind === kind ? "bg-elevated text-ink" : "text-ink-3 hover:text-ink-2",
                        )}
                      >
                        {kind === "new" ? "New task" : "Existing task"}
                      </button>
                    ))}
                  </div>
                  {blockers.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setBlockers((list) => list.filter((x) => x.key !== b.key))}
                      className="ml-auto rounded px-1.5 py-0.5 text-xs text-ink-3 hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                {b.kind === "new" ? (
                  <>
                    <div className="space-y-1">
                      <label htmlFor={`blocker-title-${b.key}`} className={LABEL}>
                        What needs doing
                      </label>
                      <input
                        id={`blocker-title-${b.key}`}
                        value={b.title}
                        onChange={(e) => update(b.key, { title: e.target.value })}
                        maxLength={200}
                        autoComplete="off"
                        placeholder="e.g. Order the motor drivers"
                        className={FIELD}
                      />
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label htmlFor={`blocker-team-${b.key}`} className={LABEL}>
                          Sub-team
                        </label>
                        <select
                          id={`blocker-team-${b.key}`}
                          value={b.teamId}
                          onChange={(e) => update(b.key, { teamId: e.target.value })}
                          className={FIELD}
                        >
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <span id={`blocker-priority-${b.key}`} className={LABEL}>
                          Priority
                        </span>
                        <div role="radiogroup" aria-labelledby={`blocker-priority-${b.key}`} className="grid grid-cols-4 gap-1">
                          {TASK_PRIORITIES.map((p) => (
                            <button
                              key={p}
                              type="button"
                              role="radio"
                              aria-checked={b.priority === p}
                              onClick={() => update(b.key, { priority: p })}
                              className="rounded-md border px-1 py-1.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                              style={
                                b.priority === p
                                  ? {
                                      color: PRIORITY_COLOUR[p],
                                      borderColor: PRIORITY_COLOUR[p],
                                      backgroundColor: `color-mix(in srgb, ${PRIORITY_COLOUR[p]} 16%, transparent)`,
                                    }
                                  : { borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }
                              }
                            >
                              {PRIORITY_LABEL[p]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <AssigneePicker
                      id={`blocker-people-${b.key}`}
                      members={members}
                      teams={teams}
                      teamId={b.teamId}
                      value={b.assigneeIds}
                      onChange={(assigneeIds) => update(b.key, { assigneeIds })}
                    />
                    <p className="text-[11px] text-ink-3">Made in {teamName(b.teamId)}&apos;s To do column.</p>
                  </>
                ) : (
                  <div className="space-y-1">
                    <label htmlFor={`blocker-task-${b.key}`} className={LABEL}>
                      The task it is waiting on
                    </label>
                    <select
                      id={`blocker-task-${b.key}`}
                      value={b.taskId}
                      onChange={(e) => update(b.key, { taskId: e.target.value })}
                      className={FIELD}
                    >
                      <option value="">Choose a task…</option>
                      {candidates
                        .filter((t) => t.id === b.taskId || !chosen.has(t.id))
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.key} — {t.title}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={() => setBlockers((list) => [...list, blank()])}
              className="w-full rounded-md border border-dashed border-line px-3 py-1.5 text-xs text-ink-2 hover:border-line-strong hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              + Add another task it is waiting on
            </button>
          </fieldset>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
          <p role="alert" className="mr-auto min-w-0 text-xs text-danger">
            {error}
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs text-ink-2 transition-colors hover:bg-elevated hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {saving ? "Saving…" : already ? "Save" : "Block Task"}
          </button>
        </div>
      </form>
    </div>
  );
}

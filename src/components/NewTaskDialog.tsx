"use client";

import { useEffect, useState } from "react";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  TASK_PRIORITIES,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/domain";
import type { MemberView, MilestoneView, TeamView } from "@/lib/project";

interface Props {
  status: TaskStatus;
  teams: TeamView[];
  members: MemberView[];
  milestones: MilestoneView[];
  defaultTeamId?: string;
  onClose: () => void;
  onCreated: () => void;
}

const FIELD =
  "w-full rounded-md border border-edge bg-surface-2 px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-info focus:outline-none";
const LABEL = "block text-[11px] font-medium tracking-wide text-ink-faint uppercase";

export function NewTaskDialog({
  status,
  teams,
  members,
  milestones,
  defaultTeamId,
  onClose,
  onCreated,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState(defaultTeamId ?? teams[0]?.id ?? "");
  const [assigneeId, setAssigneeId] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [estimateDays, setEstimateDays] = useState(3);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !teamId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          teamId,
          status,
          priority,
          assigneeId: assigneeId || null,
          milestoneId: milestoneId || null,
          estimateDays,
        }),
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      onCreated();
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
        className="relative w-full max-w-lg space-y-4 rounded-xl border border-edge bg-ground p-5 shadow-2xl"
      >
        <header>
          <h2 className="text-sm font-semibold">New task</h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            It will land in the {STATUS_LABEL[status]} column.
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
            placeholder="Machine the suspension uprights"
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

        <div className="grid grid-cols-2 gap-3">
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
            <label className={LABEL} htmlFor="new-estimate">
              Estimate (days)
            </label>
            <input
              id="new-estimate"
              type="number"
              min={0}
              max={365}
              value={estimateDays}
              onChange={(e) => setEstimateDays(Number(e.target.value) || 0)}
              className={FIELD}
            />
          </div>

          <div className="col-span-2 space-y-1.5">
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
        </div>

        {error ? (
          <p role="alert" className="text-xs text-late">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="rounded-md bg-mars px-3 py-1.5 text-sm font-medium text-ground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Creating..." : "Create task"}
          </button>
        </div>
      </form>
    </div>
  );
}

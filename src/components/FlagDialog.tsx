"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Asks what is wrong before raising a flag.
 *
 * A bare flag only says "look at this", which leaves whoever looks to work out
 * why from the card alone -- and the person who raised it is often the only
 * one who knows. One sentence captured here is what makes the flag worth
 * having on the sub-teams page, where the leads actually read them.
 *
 * The reason is optional: refusing to raise a flag until someone writes prose
 * would just mean fewer flags, which is worse than a flag without a note.
 */
export function FlagDialog({
  taskKey,
  taskTitle,
  onCancel,
  onConfirm,
}: {
  taskKey: string;
  taskTitle: string;
  onCancel: () => void;
  onConfirm: (reason: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="flag-heading"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 bg-black/55"
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(reason.trim() || null);
        }}
        className="relative w-full max-w-md space-y-3 rounded-xl border border-line bg-panel p-4 shadow-2xl shadow-black/40"
      >
        <div className="space-y-1">
          <h2 id="flag-heading" className="text-sm font-semibold text-danger">
            Flag this task
          </h2>
          <p className="text-xs text-ink-3">
            <span className="font-mono" translate="no">
              {taskKey}
            </span>{" "}
            &middot; {taskTitle}
          </p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="flag-reason"
            className="block text-xs font-medium text-ink-2"
          >
            What needs attention?
          </label>
          <textarea
            ref={inputRef}
            id="flag-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder="e.g. Waiting on the supplier to confirm the lead time"
            className="w-full resize-y rounded-md border border-line bg-elevated px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <p className="text-[11px] text-ink-3">
            Shown with the flag on the sub-teams page. Optional, but it is the
            part other people read.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs text-ink-2 transition-colors hover:bg-elevated hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Raise Flag
          </button>
        </div>
      </form>
    </div>
  );
}

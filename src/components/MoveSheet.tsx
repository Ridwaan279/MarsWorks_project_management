"use client";

import { useEffect } from "react";
import clsx from "clsx";
import { BOARD_COLUMNS, type TaskStatus } from "@/lib/domain";

/**
 * Move a card to another column without dragging it.
 *
 * Drag-and-drop needs the destination on screen, and on a phone only one
 * column fits -- so moving a task from To do to Done means dragging it past
 * four columns that are not visible, holding a finger down the whole way.
 * Picking the column from a list is the same decision with none of the
 * dexterity, and it is the only way this works one-handed.
 *
 * A sheet rather than a dropdown: it comes up from the bottom of the screen,
 * within reach of a thumb, and the rows are big enough to hit without aiming.
 */
export function MoveSheet({
  taskKey,
  taskTitle,
  current,
  onCancel,
  onMove,
}: {
  taskKey: string;
  taskTitle: string;
  current: TaskStatus;
  onCancel: () => void;
  onMove: (status: TaskStatus) => void;
}) {
  useEffect(() => {
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
      aria-labelledby="move-heading"
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
    >
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 bg-black/55"
      />
      <div className="relative w-full max-w-md rounded-t-2xl border border-line bg-panel pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/40 sm:rounded-2xl sm:pb-2">
        <div className="space-y-0.5 px-4 pt-4 pb-2">
          <h2 id="move-heading" className="text-sm font-semibold">
            Move to
          </h2>
          <p className="truncate text-xs text-ink-3">
            <span className="font-mono" translate="no">
              {taskKey}
            </span>{" "}
            &middot; {taskTitle}
          </p>
        </div>

        <ul className="px-2 pb-1">
          {BOARD_COLUMNS.map((column) => {
            const here = column.status === current;
            return (
              <li key={column.status}>
                <button
                  type="button"
                  disabled={here}
                  onClick={() => onMove(column.status)}
                  className={clsx(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-3 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                    here
                      ? "cursor-default bg-elevated font-medium text-ink"
                      : "text-ink-2 hover:bg-elevated hover:text-ink",
                  )}
                >
                  <span
                    aria-hidden
                    className={clsx(
                      "h-4 w-0.5 shrink-0 rounded-full",
                      here ? "bg-accent" : "bg-transparent",
                    )}
                  />
                  <span className="flex-1">{column.label}</span>
                  {here ? (
                    <span className="text-[11px] text-ink-3">current</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

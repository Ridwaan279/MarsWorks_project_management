"use client";

import { useEffect, useRef } from "react";

/**
 * Asks before something that cannot be undone.
 *
 * Focus starts on Cancel, so a stray Enter -- or a second tap landing where
 * the button that opened this used to be -- backs out rather than goes ahead.
 *
 * Escape is caught on the way down and stopped there, so it closes only this
 * dialog and not the drawer or page underneath, which listen for it too.
 */
export function ConfirmDialog({
  title,
  subtitle,
  children,
  confirmLabel,
  busyLabel,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  confirmLabel: string;
  busyLabel: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (!busy) onCancel();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel, busy]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-heading"
      aria-describedby="confirm-body"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      {/* A click outside cancels too. Hidden from assistive tech: Escape and
          the Cancel button already do this, and one Cancel is enough. */}
      <div
        aria-hidden
        onClick={busy ? undefined : onCancel}
        className="absolute inset-0 bg-black/55"
      />
      <div className="relative w-full max-w-md space-y-3 rounded-xl border border-line bg-panel p-4 shadow-2xl shadow-black/40">
        <div className="space-y-1">
          <h2 id="confirm-heading" className="text-sm font-semibold text-danger">
            {title}
          </h2>
          {subtitle ? <p className="text-xs text-ink-3">{subtitle}</p> : null}
        </div>

        <div id="confirm-body" className="space-y-2 text-sm text-ink-2 text-pretty">
          {children}
        </div>

        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-2 text-sm text-ink-2 transition-colors hover:bg-elevated hover:text-ink disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:py-1.5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md bg-danger px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-panel sm:py-1.5"
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

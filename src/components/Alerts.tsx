"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PRIORITY_LABEL } from "@/lib/domain";
import type { Alerts as AlertsData } from "@/lib/alerts";
import { PRIORITY_COLOUR } from "./ui";

const OPEN_EVENT = "mw:open-alerts";
/** Tells the bell how many are left once notices are dismissed. */
const COUNT_EVENT = "mw:alerts-count";

/**
 * What someone needs to know when they open the site (see src/lib/alerts.ts):
 * for sub-team leads, the tasks in their sub-team blocking other work, with
 * their priority; for anyone, notices such as a task of theirs no longer
 * being blocked. It opens by itself once per visit while there are blockers
 * -- again whenever a new one appears -- and whenever there is a notice
 * not yet dismissed. The bell in the header opens it any time.
 */
export function AlertsDialog({ alerts, memberId }: { alerts: AlertsData; memberId: string }) {
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState(alerts.notices);
  const { blockers } = alerts;
  // Changes when a blocker appears or goes, so a new one is shown again.
  // Ones this person set up themselves are listed, but never pop up: they
  // already know, and are usually still in the middle of it.
  const news = blockers.filter((b) => !b.byYou);
  const signature = news.map((b) => `${b.id}:${b.priority}`).join(",");
  const seenKey = `mw-blockers-seen:${memberId}`;

  /* eslint-disable react-hooks/set-state-in-effect -- reading browser storage after hydration */
  useEffect(() => {
    let shownThisVisit = false;
    try {
      shownThisVisit = sessionStorage.getItem(seenKey) === signature;
    } catch {
      // Storage refused (private browsing): show it, which is the safe side.
    }
    if (alerts.notices.length > 0 || (news.length > 0 && !shownThisVisit)) setOpen(true);
  }, [alerts.notices.length, news.length, seenKey, signature]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function dismiss() {
    setOpen(false);
    try {
      sessionStorage.setItem(seenKey, signature);
    } catch {
      // Nothing to do: it simply shows again on the next page.
    }
    if (notices.length > 0) {
      const ids = notices.map((n) => n.id);
      setNotices([]);
      window.dispatchEvent(new CustomEvent(COUNT_EVENT, { detail: blockers.length }));
      void fetch("/api/notifications/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }).catch(() => {});
    }
  }

  if (!open || (blockers.length === 0 && notices.length === 0)) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="alerts-heading" className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <button type="button" aria-label="Close" onClick={dismiss} className="absolute inset-0 bg-black/55" />
      <div className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col rounded-xl border border-line bg-panel shadow-2xl shadow-black/40">
        <h2 id="alerts-heading" className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          {blockers.length > 0 && notices.length > 0
            ? "Blocked work, and news"
            : blockers.length > 0
              ? "Tasks in your sub-team are blocking other work"
              : notices.length === 1
                ? "A task is no longer blocked"
                : "Tasks no longer blocked"}
        </h2>
        <div className="selectable min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {blockers.length > 0 ? (
            <section className="space-y-2">
              <p className="text-xs text-ink-2 text-pretty">
                {blockers.length === 1 ? "This task was" : "These tasks were"} added to your sub-team because{" "}
                {blockers.length === 1 ? "it is" : "they are"} blocking another task. The colour is how urgent{" "}
                {blockers.length === 1 ? "it is" : "each is"}.
              </p>
              <ul className="space-y-2">
                {blockers.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/board?task=${b.id}`}
                      onClick={dismiss}
                      className="block rounded-lg border px-3 py-2 transition-colors hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      style={{ borderColor: PRIORITY_COLOUR[b.priority] }}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="shrink-0 rounded px-1.5 py-px text-[11px] font-medium"
                          style={{
                            color: PRIORITY_COLOUR[b.priority],
                            backgroundColor: `color-mix(in srgb, ${PRIORITY_COLOUR[b.priority]} 16%, transparent)`,
                          }}
                        >
                          {PRIORITY_LABEL[b.priority]} priority
                        </span>
                        <span className="font-mono text-[11px] text-ink-3" translate="no">
                          {b.key}
                        </span>
                        <span className="ml-auto shrink-0 text-[11px] text-ink-3">{b.teamName}</span>
                      </span>
                      <span className="mt-1 block text-sm text-ink">{b.title}</span>
                      <span className="mt-0.5 block text-xs text-ink-3">
                        Blocking{" "}
                        {b.blocking.map((t, i) => (
                          <span key={t.id}>
                            {i > 0 ? ", " : ""}
                            <span className="font-mono" translate="no">{t.key}</span> {t.title} ({t.teamName})
                          </span>
                        ))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {notices.length > 0 ? (
            <section className="space-y-2">
              <ul className="space-y-2">
                {notices.map((n) => (
                  <li key={n.id} className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-ink text-pretty">
                    {n.taskId ? (
                      <Link href={`/board?task=${n.taskId}`} onClick={dismiss} className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                        {n.message}
                      </Link>
                    ) : (
                      n.message
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <div className="flex justify-end border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={dismiss}
            autoFocus
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/** The header's way back to the alerts: a bell with how many there are. */
export function AlertsButton({ count: initial }: { count: number }) {
  const [count, setCount] = useState(initial);
  useEffect(() => {
    const update = (event: Event) => setCount((event as CustomEvent<number>).detail);
    window.addEventListener(COUNT_EVENT, update);
    return () => window.removeEventListener(COUNT_EVENT, update);
  }, []);
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      aria-label={`${count} ${count === 1 ? "alert" : "alerts"}: blocked work and news`}
      title="Blocked work and news"
      className="relative grid h-8 w-8 place-items-center rounded-md border border-line text-ink-2 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3L4 11Z" strokeLinejoin="round" />
        <path d="M6.5 14a1.5 1.5 0 0 0 3 0" strokeLinecap="round" />
      </svg>
      <span className="absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-medium text-white">
        {count}
      </span>
    </button>
  );
}

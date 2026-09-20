"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface Guide {
  title: string;
  lead: string;
  steps: { heading: string; body: string }[];
}

/**
 * Page-specific onboarding. Each entry answers "what is this screen for and
 * what do I do on it", which is the question a new sub-team lead actually has
 * on their first visit.
 */
const GUIDES: Record<string, Guide> = {
  "/": {
    title: "Project overview",
    lead: "The one screen that answers: is any sub-team behind?",
    steps: [
      {
        heading: "Milestones",
        body: "Each ARC deadline with its forecast. “No work linked” means nobody has attached tasks to it yet, so there is nothing to forecast from.",
      },
      {
        heading: "Sub-team cards",
        body: "Progress, open work, and how far the team is slipping against its own planned dates. Click any card for the full breakdown.",
      },
      {
        heading: "Undated work",
        body: "A task with no end date cannot be forecast and cannot warn anyone downstream. The line at the top counts them.",
      },
    ],
  },
  "/teams": {
    title: "Sub-team breakdown",
    lead: "The detail behind the overview, and the lists worth acting on.",
    steps: [
      {
        heading: "The table",
        body: "Every sub-team’s progress, blocked and undated counts, slip against plan, and forecast finish.",
      },
      {
        heading: "Flagged",
        body: "Anything someone flagged on the board as needing attention, whatever its status.",
      },
      {
        heading: "Undated",
        body: "Give each of these a planned end date and it joins the forecast.",
      },
    ],
  },
  "/board": {
    title: "Board",
    lead: "Day-to-day task flow across every sub-team.",
    steps: [
      {
        heading: "Current vs All Tasks",
        body: "Current shows work whose dates span today, plus anything unfinished that is already overdue. All Tasks drops that window.",
      },
      {
        heading: "Moving work",
        body: "Drag a card between columns to change its status. Sliding progress to 100% moves it to Done on its own.",
      },
      {
        heading: "Flagging",
        body: "Click the flag on a card to raise it. Flagged cards turn red and appear on the Sub-teams page.",
      },
      {
        heading: "Scrolling",
        body: "Two fingers sideways on a trackpad, or a wheel over the column headers, moves the board across.",
      },
    ],
  },
  "/timeline": {
    title: "Timeline",
    lead: "Every sub-team’s plan on one chart, grouped by workstream.",
    steps: [
      {
        heading: "Range",
        body: "Current covers a month back and three months on. Everything spans the whole season, through to September 2027.",
      },
      {
        heading: "Reading a bar",
        body: "The filled part is progress. An orange outline means the task is on the critical path, so any slip moves the whole project.",
      },
      {
        heading: "Lines",
        body: "The pale grey line is today. Amber lines are milestones.",
      },
    ],
  },
  "/impact": {
    title: "Delay impact",
    lead: "If one task slips, which other sub-teams feel it?",
    steps: [
      {
        heading: "Pick and slide",
        body: "Choose a task, then set how many days late it runs. Nothing here is saved.",
      },
      {
        heading: "Reading the result",
        body: "Only tasks that depend on it move. A delay smaller than the available float changes nothing at all — that float is the project’s buffer.",
      },
    ],
  },
};

export function HelpButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const guide = GUIDES[pathname] ?? GUIDES["/"];

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`How to use the ${guide.title} page`}
        title="How this page works"
        className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-full border border-edge text-sm font-medium text-ink-faint transition-colors hover:border-mars/50 hover:text-mars focus:outline-none focus-visible:ring-2 focus-visible:ring-mars"
      >
        ?
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            className="selectable overscroll-none-safe relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-edge bg-surface p-6 shadow-2xl shadow-black/60"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="help-title" className="text-lg font-semibold tracking-tight">
                  {guide.title}
                </h2>
                <p className="mt-1 text-sm text-ink-muted text-pretty">{guide.lead}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-m-1 rounded p-1 text-ink-faint transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-mars"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
                  <path d="M4.3 3.3a1 1 0 0 1 1.4 0L8 5.6l2.3-2.3a1 1 0 1 1 1.4 1.4L9.4 7l2.3 2.3a1 1 0 0 1-1.4 1.4L8 8.4l-2.3 2.3a1 1 0 0 1-1.4-1.4L6.6 7 4.3 4.7a1 1 0 0 1 0-1.4Z" />
                </svg>
              </button>
            </div>

            <ol className="mt-5 space-y-4">
              {guide.steps.map((step, i) => (
                <li key={step.heading} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-mars/15 font-mono text-[11px] text-mars"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium">{step.heading}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-ink-muted text-pretty">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </>
  );
}

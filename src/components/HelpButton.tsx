"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

interface Step {
  heading: string;
  body: string;
}

interface Guide {
  title: string;
  lead: string;
  steps: Step[];
}

/**
 * Page-specific onboarding, walked through one step at a time. Each guide
 * answers "what is this screen for and what do I do on it", which is the
 * question a new sub-team lead actually has on their first visit.
 */
const GUIDES: Record<string, Guide> = {
  "/": {
    title: "Project overview",
    lead: "The one screen that answers: is any sub-team behind?",
    steps: [
      {
        heading: "Start with the summary line",
        body: "It tells you how many sub-teams are behind their own plan, and how much work carries no end date. Undated work cannot be forecast, so it is the first thing to fix.",
      },
      {
        heading: "Check the milestones",
        body: "Each ARC deadline with its forecast. “No work linked” means nobody has attached tasks to it yet, so there is nothing to forecast from — a sub-team lead needs to link their work.",
      },
      {
        heading: "Scan the sub-team cards",
        body: "Progress, open work, and how far each team is slipping against its own planned dates. Red text means behind plan.",
      },
      {
        heading: "Go deeper",
        body: "Click any card, or “Full breakdown”, for the per-team table and the blocked, flagged and undated lists.",
      },
    ],
  },
  "/teams": {
    title: "Sub-team breakdown",
    lead: "The detail behind the overview, and the lists worth acting on.",
    steps: [
      {
        heading: "Read the table",
        body: "Every sub-team’s progress, blocked and undated counts, slip against plan, and forecast finish date.",
      },
      {
        heading: "Clear what is blocked",
        body: "Blocked tasks are waiting on something. The row shows which task is holding each one up.",
      },
      {
        heading: "Review flagged work",
        body: "Anything someone flagged on the board as needing attention, whatever its status.",
      },
      {
        heading: "Date the undated",
        body: "Give each of these a planned end date and it joins the forecast, and starts warning the teams downstream of it.",
      },
    ],
  },
  "/board": {
    title: "Board",
    lead: "Day-to-day task flow across every sub-team.",
    steps: [
      {
        heading: "Current or All Tasks",
        body: "Current shows work whose dates span today, plus anything unfinished that is already overdue. All Tasks drops that window. The counter says how much Current is hiding.",
      },
      {
        heading: "Add a task",
        body: "The + on any column. Fill in as much as you can, especially the dates — a task with no end date will not appear under Current and cannot be forecast.",
      },
      {
        heading: "Move work along",
        body: "Drag a card between columns to change its status. Sliding progress to 100% in the task panel moves it to Done on its own.",
      },
      {
        heading: "Flag what needs attention",
        body: "Click the flag on a card. Flagged cards turn red and are listed on the Sub-teams page for everyone to see.",
      },
      {
        heading: "Move around",
        body: "Two fingers sideways on a trackpad scrolls the board across, as does a wheel over the column headers. Cards are tinted by sub-team.",
      },
    ],
  },
  "/timeline": {
    title: "Timeline",
    lead: "Every sub-team’s plan on one chart, grouped by workstream.",
    steps: [
      {
        heading: "Choose a range",
        body: "Current covers a month back and three months on. Whole season spans the year through to the September 2027 handover.",
      },
      {
        heading: "Narrow it down",
        body: "Filter to a single sub-team, hide completed work, or change the zoom to fit more weeks on screen.",
      },
      {
        heading: "Read a bar",
        body: "The bar is coloured by the sub-team that owns it, and the filled part is progress. An orange outline means the task is on the critical path, so any slip there moves the whole project.",
      },
      {
        heading: "Read the lines",
        body: "The orange vertical line is today. Milestones are marked in orange along the top.",
      },
    ],
  },
  "/impact": {
    title: "Delay impact",
    lead: "If one task slips, which other sub-teams feel it?",
    steps: [
      {
        heading: "Pick a task",
        body: "Grouped by sub-team. Only unfinished work is listed, since finished work cannot slip.",
      },
      {
        heading: "Set the delay",
        body: "Slide to however many days late it runs. Nothing here is saved — it is a question, not a change.",
      },
      {
        heading: "Read the blast radius",
        body: "Only tasks that depend on it move. A delay smaller than the available float changes nothing at all, and that float is the project’s buffer.",
      },
    ],
  },
};

export function HelpButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const guide = GUIDES[pathname] ?? GUIDES["/"];
  const last = guide.steps.length - 1;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setOpen(false);
    setStep(0);
  }, [pathname]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") setStep((s) => Math.min(s + 1, last));
      if (event.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    }
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close, last]);

  const current = guide.steps[step];

  const overlay = (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close guide"
        onClick={close}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="selectable relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-elevated shadow-2xl shadow-black/40 focus:outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-accent uppercase">
              How this page works
            </p>
            <h2 id="help-title" className="mt-0.5 text-lg font-semibold tracking-tight">
              {guide.title}
            </h2>
            <p className="mt-1 text-sm text-ink-2 text-pretty">{guide.lead}</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close guide"
            className="-m-1 shrink-0 rounded p-1 text-ink-3 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M4.3 3.3a1 1 0 0 1 1.4 0L8 5.6l2.3-2.3a1 1 0 1 1 1.4 1.4L9.4 7l2.3 2.3a1 1 0 0 1-1.4 1.4L8 8.4l-2.3 2.3a1 1 0 0 1-1.4-1.4L6.6 7 4.3 4.7a1 1 0 0 1 0-1.4Z" />
            </svg>
          </button>
        </header>

        <div className="overscroll-none-safe flex-1 overflow-y-auto px-6 py-5">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-tint font-mono text-sm text-accent"
            >
              {step + 1}
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-medium">{current.heading}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2 text-pretty">
                {current.body}
              </p>
            </div>
          </div>
        </div>

        <footer className="flex items-center gap-3 border-t border-line px-6 py-3">
          {/* Dots double as direct navigation, so a five-step guide is not a
              five-click journey to reach the last point. */}
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Steps">
            {guide.steps.map((s, i) => (
              <button
                key={s.heading}
                type="button"
                role="tab"
                aria-selected={i === step}
                aria-label={`Step ${i + 1}: ${s.heading}`}
                onClick={() => setStep(i)}
                className={
                  i === step
                    ? "h-1.5 w-5 rounded-full bg-accent transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    : "h-1.5 w-1.5 rounded-full bg-line-strong transition-all hover:bg-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                }
              />
            ))}
          </div>

          <span className="ml-1 text-xs text-ink-3 tabular-nums">
            {step + 1} of {guide.steps.length}
          </span>

          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(s - 1, 0))}
              disabled={step === 0}
              className="rounded-md px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-panel hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Back
            </button>
            {step === last ? (
              <button
                type="button"
                onClick={close}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Got It
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(s + 1, last))}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Next
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
        aria-label={`How to use the ${guide.title} page`}
        title="How this page works"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line text-sm font-medium text-ink-3 transition-colors hover:border-accent/50 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        ?
      </button>

      {/*
       * Rendered into the body, not here. The header sets backdrop-filter,
       * which makes it the containing block for fixed-position descendants --
       * so a dialog rendered inline was positioned against the header strip
       * and appeared off screen rather than centred in the viewport.
       */}
      {mounted && open ? createPortal(overlay, document.body) : null}
    </>
  );
}

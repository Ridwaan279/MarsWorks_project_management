"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

interface Step {
  heading: string;
  body: string;
  /**
   * CSS selector for the control this step is about. The card is placed beside
   * that element and the element is spotlit, so the guide points at the thing
   * it is describing rather than describing it in the abstract.
   */
  target?: string;
}

interface Guide {
  title: string;
  steps: Step[];
}

const GUIDES: Record<string, Guide> = {
  "/": {
    title: "Project overview",
    steps: [
      {
        heading: "Start here",
        body: "This line says how many sub-teams are behind their own plan, and how much work carries no end date. Undated work cannot be forecast, so it is the first thing to fix.",
        target: "[data-tour='summary']",
      },
      {
        heading: "Milestones",
        body: "Each ARC deadline with its forecast. “No work linked” means nobody has attached tasks to it yet, so there is nothing to forecast from.",
        target: "[data-tour='milestones']",
      },
      {
        heading: "Sub-team cards",
        body: "Progress, open work, and how far each team is slipping against its own dates. Red text means behind plan. Click any card for the detail.",
        target: "[data-tour='teams']",
      },
      {
        heading: "Switch theme",
        body: "Light and dark. Your choice is remembered on this device.",
        target: "[data-tour='theme']",
      },
    ],
  },
  "/teams": {
    title: "Sub-team breakdown",
    steps: [
      {
        heading: "The table",
        body: "Every sub-team’s progress, blocked and undated counts, slip against plan, and forecast finish date.",
        target: "[data-tour='table']",
      },
      {
        heading: "Blocked and behind",
        body: "Blocked tasks are waiting on something, and the row names what. Behind-plan tasks are running past their own end dates.",
        target: "[data-tour='lists']",
      },
      {
        heading: "Undated work",
        body: "Give each of these a planned end date and it joins the forecast, and starts warning the teams downstream of it.",
        target: "[data-tour='undated']",
      },
    ],
  },
  "/board": {
    title: "Board",
    steps: [
      {
        heading: "Current or all work",
        body: "Current shows work whose dates span today, plus anything unfinished that is already overdue. All Tasks drops that window.",
        target: "[data-tour='scope']",
      },
      {
        heading: "Narrow the board",
        body: "Filter to one sub-team or one person. The counter on the right says how much is hidden.",
        target: "[data-tour='filters']",
      },
      {
        heading: "Add a task",
        body: "The plus on any column. Fill in the dates especially — a task with no end date will not appear under Current and cannot be forecast. You can create a new workstream from there too.",
        target: "[data-tour='add']",
      },
      {
        heading: "Move and flag",
        body: "Drag a card between columns to change its status. The flag on a card raises it for attention: flagged cards turn red and are listed on the Sub-teams page. The bar down the left of each card is its sub-team’s colour.",
        target: "[data-tour='card']",
      },
    ],
  },
  "/timeline": {
    title: "Timeline",
    steps: [
      {
        heading: "Choose a range",
        body: "Current covers a month back and three months on. Whole season spans the year through to the September 2027 handover.",
        target: "[data-tour='range']",
      },
      {
        heading: "Narrow it down",
        body: "Filter to a single sub-team, hide completed work, or change the zoom to fit more weeks on screen.",
        target: "[data-tour='filters']",
      },
      {
        heading: "Read a bar",
        body: "Each bar is coloured by the sub-team that owns it, and the filled part is progress. An orange outline means the task is on the critical path, so any slip there moves the whole project.",
        target: "[data-tour='chart']",
      },
    ],
  },
  "/impact": {
    title: "Delay impact",
    steps: [
      {
        heading: "Pick a task and a delay",
        body: "Choose any unfinished task, then set how many days late it runs. Nothing here is saved — it is a question, not a change.",
        target: "[data-tour='controls']",
      },
      {
        heading: "Read the blast radius",
        body: "Only tasks that depend on it move. A delay smaller than the available float changes nothing at all, and that float is the project’s buffer.",
        target: "[data-tour='result']",
      },
    ],
  },
};

const CARD_W = 340;
const GAP = 14;

interface Placement {
  top: number;
  left: number;
  spot: { top: number; left: number; width: number; height: number } | null;
}

/** Put the card beside its target, clamped so it never leaves the viewport. */
function place(target: Element | null, cardHeight: number): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!target) {
    return {
      top: Math.max(16, vh / 2 - cardHeight / 2),
      left: Math.max(16, vw / 2 - CARD_W / 2),
      spot: null,
    };
  }

  const r = target.getBoundingClientRect();
  const pad = 6;
  const spot = {
    top: r.top - pad,
    left: r.left - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  };

  // Prefer below, then above, then beside — whichever has room.
  let top = spot.top + spot.height + GAP;
  if (top + cardHeight > vh - 16) {
    const above = spot.top - GAP - cardHeight;
    top = above >= 16 ? above : Math.max(16, vh - cardHeight - 16);
  }

  let left = spot.left + spot.width / 2 - CARD_W / 2;
  left = Math.min(Math.max(left, 16), vw - CARD_W - 16);

  return { top, left, spot };
}

export function HelpButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const guide = GUIDES[pathname] ?? GUIDES["/"];
  const last = guide.steps.length - 1;
  const current = guide.steps[step];

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    setOpen(false);
    setStep(0);
  }, [pathname]);

  const close = useCallback(() => setOpen(false), []);

  const reposition = useCallback(() => {
    if (!open) return;
    const target = current.target ? document.querySelector(current.target) : null;
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    const height = cardRef.current?.offsetHeight ?? 200;
    setPlacement(place(target, height));
  }, [open, current]);

  // Measure after the card has rendered, so its real height is used.
  useLayoutEffect(() => {
    reposition();
  }, [reposition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") setStep((s) => Math.min(s + 1, last));
      if (event.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close, last]);

  const overlay = (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-heading">
      {/* A hole punched over the target, rather than a flat scrim, so the
          control being described stays legible while the rest recedes. */}
      <button
        type="button"
        aria-label="Close guide"
        onClick={close}
        className="absolute inset-0 bg-black/55"
        style={
          placement?.spot
            ? {
                clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${placement.spot.top}px, ${placement.spot.left}px ${placement.spot.top}px, ${placement.spot.left}px ${placement.spot.top + placement.spot.height}px, ${placement.spot.left + placement.spot.width}px ${placement.spot.top + placement.spot.height}px, ${placement.spot.left + placement.spot.width}px ${placement.spot.top}px, 0 ${placement.spot.top}px)`,
              }
            : undefined
        }
      />

      {placement?.spot ? (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-lg ring-2 ring-accent transition-all duration-200"
          style={{
            top: placement.spot.top,
            left: placement.spot.left,
            width: placement.spot.width,
            height: placement.spot.height,
          }}
        />
      ) : null}

      <div
        ref={cardRef}
        className="selectable absolute rounded-xl border border-line bg-elevated p-4 shadow-2xl shadow-black/40 transition-all duration-200"
        style={{
          width: CARD_W,
          top: placement?.top ?? 120,
          left: placement?.left ?? 24,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-wide text-accent uppercase">
              {guide.title}
            </p>
            <h2 id="tour-heading" className="mt-0.5 text-sm font-semibold">
              {current.heading}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close guide"
            className="-m-1 shrink-0 rounded p-1 text-ink-3 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
              <path d="M4.3 3.3a1 1 0 0 1 1.4 0L8 5.6l2.3-2.3a1 1 0 1 1 1.4 1.4L9.4 7l2.3 2.3a1 1 0 0 1-1.4 1.4L8 8.4l-2.3 2.3a1 1 0 0 1-1.4-1.4L6.6 7 4.3 4.7a1 1 0 0 1 0-1.4Z" />
            </svg>
          </button>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-ink-2 text-pretty">{current.body}</p>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {guide.steps.map((s, i) => (
              <button
                key={s.heading}
                type="button"
                aria-label={`Step ${i + 1}: ${s.heading}`}
                aria-current={i === step}
                onClick={() => setStep(i)}
                className={
                  i === step
                    ? "h-1.5 w-5 rounded-full bg-accent transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    : "h-1.5 w-1.5 rounded-full bg-line-strong transition-all hover:bg-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                }
              />
            ))}
          </div>
          <span className="text-[11px] text-ink-3 tabular-nums">
            {step + 1}/{guide.steps.length}
          </span>

          <div className="ml-auto flex gap-1.5">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(s - 1, 0))}
              disabled={step === 0}
              className="rounded-md px-3 py-1.5 text-xs text-ink-2 transition-colors hover:bg-panel hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => (step === last ? close() : setStep((s) => s + 1))}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {step === last ? "Got It" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        data-tour="help"
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
       * Rendered into the body. The header sets backdrop-filter, which makes
       * it the containing block for fixed-position descendants -- a dialog
       * rendered inline was positioned against the header strip instead of
       * the viewport.
       */}
      {mounted && open ? createPortal(overlay, document.body) : null}
    </>
  );
}

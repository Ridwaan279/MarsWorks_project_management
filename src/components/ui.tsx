import clsx from "clsx";
import type { HealthLevel, TaskPriority, TaskStatus } from "@/lib/domain";

export function TeamDot({ colour, className }: { colour: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx("inline-block h-2 w-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: colour }}
    />
  );
}

const HEALTH_STYLES: Record<HealthLevel, string> = {
  ON_TRACK: "bg-success/15 text-success ring-success/25",
  AT_RISK: "bg-warning/15 text-warning ring-warning/25",
  BEHIND: "bg-danger/15 text-danger ring-danger/25",
};

export function HealthPill({
  level,
  label,
  className,
}: {
  level: HealthLevel;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        HEALTH_STYLES[level],
        className,
      )}
    >
      {label}
    </span>
  );
}

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  LOW: "text-ink-3",
  MEDIUM: "text-accent",
  HIGH: "text-warning",
  CRITICAL: "text-danger",
};

export function PriorityFlag({ priority }: { priority: TaskPriority }) {
  return (
    <span
      title={`${priority.charAt(0)}${priority.slice(1).toLowerCase()} priority`}
      className={clsx("inline-flex items-center", PRIORITY_STYLES[priority])}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
        <path d="M3 2a1 1 0 0 1 1-1h8.2a.8.8 0 0 1 .64 1.28L11 5l1.84 2.72A.8.8 0 0 1 12.2 9H5v5a1 1 0 1 1-2 0V2Z" />
      </svg>
      <span className="sr-only">{priority} priority</span>
    </span>
  );
}

const STATUS_STYLES: Record<TaskStatus, string> = {
  BACKLOG: "bg-elevated text-ink-2",
  TODO: "bg-elevated text-ink",
  IN_PROGRESS: "bg-accent/15 text-accent",
  BLOCKED: "bg-danger/15 text-danger",
  IN_REVIEW: "bg-accent/15 text-accent",
  DONE: "bg-success/15 text-success",
};

export function StatusBadge({ status, label }: { status: TaskStatus; label: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
        STATUS_STYLES[status],
      )}
    >
      {label}
    </span>
  );
}

/** Initials avatar. No photo hosting to manage, and it degrades gracefully. */
export function Avatar({
  name,
  size = "sm",
  className,
}: {
  name: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      title={name}
      className={clsx(
        "inline-grid shrink-0 place-items-center rounded-full bg-elevated font-medium text-ink-2 ring-1 ring-line",
        size === "sm" ? "h-5 w-5 text-[9px]" : "h-8 w-8 text-xs",
        className,
      )}
    >
      {initials || "?"}
      <span className="sr-only">{name}</span>
    </span>
  );
}

export function ProgressBar({
  value,
  colour,
  className,
}: {
  value: number;
  colour?: string;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-ink/10", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${clamped}%`, backgroundColor: colour ?? "var(--color-accent)" }}
      />
    </div>
  );
}

/** Formats a slack or variance figure the way a team lead reads it. */
export function formatDays(days: number): string {
  if (days === 0) return "on time";
  const magnitude = Math.abs(days);
  const unit = magnitude === 1 ? "day" : "days";
  return days > 0 ? `${magnitude} ${unit} late` : `${magnitude} ${unit} spare`;
}

export function Card({
  children,
  className,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      {...rest}
      className={clsx(
        "rounded-xl border border-line bg-panel p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {hint ? <p className="mt-1 text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

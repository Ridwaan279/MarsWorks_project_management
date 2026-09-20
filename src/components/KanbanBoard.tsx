"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { BOARD_COLUMNS, isCurrent, type TaskStatus } from "@/lib/domain";
import type {
  MemberView,
  MilestoneView,
  TaskView,
  TeamView,
  WorkstreamView,
} from "@/lib/project";
import type { ScheduledTask } from "@/lib/schedule";
import { SortableTaskCard, TaskCardBody } from "./TaskCard";
import { TaskDrawer } from "./TaskDrawer";
import { NewTaskDialog } from "./NewTaskDialog";
import { TeamDot } from "./ui";

interface BoardProps {
  tasks: TaskView[];
  teams: TeamView[];
  members: MemberView[];
  milestones: MilestoneView[];
  workstreams: WorkstreamView[];
  scheduled: Record<string, ScheduledTask>;
  /** The server's "now". Must come from the server: deriving it on the client
   *  makes the first client render disagree with the server's HTML, because
   *  the two clocks classify a task's window differently. */
  asOf: string;
  initialTaskId?: string;
}

const ORDER_GAP = 1000;

/**
 * Sparse ordering: a card dropped between two others takes the midpoint of
 * their positions, so a move rewrites exactly one row instead of renumbering
 * the column. Positions are re-spaced only when two neighbours collide.
 */
function orderBetween(before?: number, after?: number): number {
  if (before === undefined && after === undefined) return ORDER_GAP;
  if (before === undefined) return after! - ORDER_GAP;
  if (after === undefined) return before + ORDER_GAP;
  return (before + after) / 2;
}

export function KanbanBoard({
  tasks: initialTasks,
  teams,
  members,
  milestones,
  workstreams,
  scheduled,
  asOf,
  initialTaskId,
}: BoardProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);

  /*
   * The server is the source of truth; this state exists only to make drags
   * and edits feel instant. useState keeps its first value forever, so
   * without this the board never adopted anything the server sent afterwards
   * -- a newly created task stayed invisible until a full page reload.
   * router.refresh() only runs after a write has been accepted, so replacing
   * local state here cannot lose an optimistic change.
   */
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  useEffect(() => {
    setWorkstreamList(workstreams);
  }, [workstreams]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(initialTaskId ?? null);
  const [teamFilter, setTeamFilter] = useState<string | "ALL">("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState<string | "ALL">("ALL");
  const [creatingIn, setCreatingIn] = useState<TaskStatus | null>(null);
  const [scope, setScope] = useState<"CURRENT" | "ALL">("CURRENT");
  // Workstreams can be created from the new-task dialog, so this list has to
  // grow locally as well as arriving from the server.
  const [workstreamList, setWorkstreamList] = useState(workstreams);
  const [error, setError] = useState<string | null>(null);
  /** Board state as it was when the current drag began, for rollback. */
  const rollbackRef = useRef<TaskView[] | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  /**
   * A Kanban board scrolls sideways, but a mouse wheel only sends deltaY, so
   * without this the wheel does nothing once the column under the pointer has
   * no more rows. Translate the vertical wheel into horizontal movement, but
   * only when the column itself cannot use it, so scrolling through a long
   * column still works normally.
   */
  const handleBoardWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const board = boardRef.current;
    if (!board) return;
    // A real sideways gesture (trackpad, or shift+wheel) is already handled
    // natively by the scroll container; only a vertical wheel needs help.
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (event.deltaY === 0 || event.shiftKey) return;

    const column = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-column-scroll]",
    );
    if (column) {
      const atTop = column.scrollTop <= 0;
      const atBottom =
        column.scrollTop + column.clientHeight >= column.scrollHeight - 1;
      const canUseIt = event.deltaY < 0 ? !atTop : !atBottom;
      if (canUseIt) return;
    }

    const maxScroll = board.scrollWidth - board.clientWidth;
    if (maxScroll <= 0) return;
    const next = Math.min(Math.max(board.scrollLeft + event.deltaY, 0), maxScroll);
    if (next === board.scrollLeft) return;
    board.scrollLeft = next;
    event.preventDefault();
  }, []);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // One "today" for the whole render, taken from the server so hydration
  // matches, and so a task cannot be judged current by one comparison and not
  // by the next.
  const today = useMemo(() => new Date(asOf), [asOf]);

  const matchesFilters = useCallback(
    (task: TaskView) =>
      (teamFilter === "ALL" || task.teamId === teamFilter) &&
      (assigneeFilter === "ALL" ||
        (assigneeFilter === "UNASSIGNED"
          ? task.assigneeId === null
          : task.assigneeId === assigneeFilter)),
    [teamFilter, assigneeFilter],
  );

  const visible = useMemo(
    () =>
      tasks.filter(
        (task) =>
          matchesFilters(task) && (scope === "ALL" || isCurrent(task, today)),
      ),
    [tasks, matchesFilters, scope, today],
  );

  /** How much "Current" is hiding, so nothing disappears without saying so. */
  const hiddenByScope = useMemo(
    () =>
      scope === "ALL"
        ? 0
        : tasks.filter((t) => matchesFilters(t) && !isCurrent(t, today)).length,
    [tasks, matchesFilters, scope, today],
  );

  const columns = useMemo(() => {
    const grouped = new Map<TaskStatus, TaskView[]>(
      BOARD_COLUMNS.map((c) => [c.status, [] as TaskView[]]),
    );
    for (const task of visible) grouped.get(task.status)?.push(task);
    for (const list of grouped.values()) list.sort((a, b) => a.boardOrder - b.boardOrder);
    return grouped;
  }, [visible]);

  const sensors = useSensors(
    // A small distance threshold keeps a click-to-open from registering as a
    // drag, which is the difference between a board that feels precise and one
    // that fights you.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => () => document.body.classList.remove("is-dragging"), []);

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;
  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null;

  const persist = useCallback(
    async (taskId: string, patch: Record<string, unknown>, previous: TaskView[]) => {
      try {
        const response = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        // The schedule depends on status and estimates, so pull fresh numbers.
        router.refresh();
      } catch (cause) {
        console.error("Failed to save task", cause);
        setTasks(previous);
        setError("Could not save that change. The board has been put back.");
      }
    },
    [router],
  );

  function statusOf(id: string): TaskStatus | null {
    if (BOARD_COLUMNS.some((c) => c.status === id)) return id as TaskStatus;
    return tasks.find((t) => t.id === id)?.status ?? null;
  }

  function handleDragStart(event: DragStartEvent) {
    // Snapshot before any optimistic move so a failed write rolls back to the
    // board as it was when the drag started, not to a half-applied state.
    rollbackRef.current = tasks.map((t) => ({ ...t }));
    // Stop the pointer selecting card text while dragging across the board.
    document.body.classList.add("is-dragging");
    setActiveId(String(event.active.id));
    setError(null);
  }

  /** Move the card into the hovered column as soon as it crosses the boundary. */
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeStatus = statusOf(String(active.id));
    const overStatus = statusOf(String(over.id));
    if (!activeStatus || !overStatus || activeStatus === overStatus) return;

    setTasks((current) =>
      current.map((task) =>
        task.id === String(active.id) ? { ...task, status: overStatus } : task,
      ),
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    document.body.classList.remove("is-dragging");
    setActiveId(null);
    if (!over) return;

    const taskId = String(active.id);
    const previous = rollbackRef.current ?? tasks.map((t) => ({ ...t }));
    const targetStatus = statusOf(String(over.id));
    if (!targetStatus) return;

    const column = (columns.get(targetStatus) ?? []).filter((t) => t.id !== taskId);
    const overIndex = column.findIndex((t) => t.id === String(over.id));
    const insertAt = overIndex === -1 ? column.length : overIndex;
    const boardOrder = orderBetween(
      column[insertAt - 1]?.boardOrder,
      column[insertAt]?.boardOrder,
    );

    const moved = tasks.find((t) => t.id === taskId);
    if (!moved) return;
    if (moved.status === targetStatus && moved.boardOrder === boardOrder) return;

    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, status: targetStatus, boardOrder } : task,
      ),
    );
    void persist(taskId, { status: targetStatus, boardOrder }, previous);
  }

  const toggleFlag = useCallback(
    async (taskId: string, flagged: boolean) => {
      const previous = tasks.map((t) => ({ ...t }));
      setTasks((current) =>
        current.map((t) => (t.id === taskId ? { ...t, flagged } : t)),
      );
      try {
        const response = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flagged }),
        });
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        router.refresh();
      } catch (cause) {
        console.error("Failed to change the flag", cause);
        setTasks(previous);
        setError("Could not change that flag.");
      }
    },
    [tasks, router],
  );

  const handleTaskSaved = useCallback(
    (updated: TaskView) => {
      setTasks((current) => current.map((t) => (t.id === updated.id ? updated : t)));
      router.refresh();
    },
    [router],
  );

  /*
   * On a phone one column fills the screen, and the board starts at Backlog --
   * which under the default Current filter is usually empty. That is a screen
   * of nothing, with no sign that the work is two swipes to the right. Scroll
   * to the first column that actually holds something instead. Only on narrow
   * screens: on a desktop every column is already visible and moving the
   * scroll position would just be confusing.
   */
  const firstOccupied = BOARD_COLUMNS.find(
    (c) => (columns.get(c.status) ?? []).length > 0,
  )?.status;
  const firstOccupiedRef = useRef<HTMLElement | null>(null);
  const scrolledRef = useRef(false);

  useEffect(() => {
    if (scrolledRef.current || !firstOccupied) return;
    const board = boardRef.current;
    const target = firstOccupiedRef.current;
    if (!board || !target) return;
    if (!window.matchMedia("(max-width: 639px)").matches) return;
    // Left-align the column rather than scrollIntoView, which would also
    // scroll the page vertically.
    board.scrollLeft = target.offsetLeft - board.offsetLeft;
    scrolledRef.current = true;
  }, [firstOccupied]);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-w-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2.5 sm:px-6 sm:py-3">
        <div
          role="group"
          data-tour="scope"
          aria-label="Which tasks to show"
          className="flex items-center gap-0.5 rounded-md border border-line p-0.5"
        >
          {(
            [
              ["CURRENT", "Current"],
              ["ALL", "All Tasks"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              aria-pressed={scope === value}
              className={clsx(
                "rounded px-3 py-1.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                scope === value
                  ? "bg-elevated text-ink"
                  : "text-ink-3 hover:text-ink-2",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <label data-tour="filters" className="flex items-center gap-2 text-xs text-ink-2">
          Sub-team
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="rounded-md border border-line bg-panel px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
          >
            <option value="ALL">All teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-ink-2">
          Assignee
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="rounded-md border border-line bg-panel px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
          >
            <option value="ALL">Anyone</option>
            <option value="UNASSIGNED">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex items-center gap-3 text-xs text-ink-3">
          <span className="tabular-nums">
            {visible.length} shown
            {hiddenByScope > 0 ? (
              <>
                {" · "}
                <span
                  title="Not started yet, already finished and past, or carrying no dates at all."
                  className="text-warning"
                >
                  {hiddenByScope} outside this window
                </span>
              </>
            ) : null}
          </span>
          {teamFilter !== "ALL" ? (
            <span className="flex items-center gap-1.5">
              <TeamDot colour={teamById.get(teamFilter)?.colour ?? "#64748b"} />
              {teamById.get(teamFilter)?.name}
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          aria-live="polite"
          className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-xs text-danger sm:px-6"
        >
          {error}
        </p>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          if (rollbackRef.current) setTasks(rollbackRef.current);
          document.body.classList.remove("is-dragging");
          setActiveId(null);
        }}
      >
        <div
          ref={boardRef}
          data-board-scroll
          onWheel={handleBoardWheel}
          className="flex min-w-0 flex-1 gap-3 overflow-x-auto overscroll-x-contain px-4 py-4 sm:px-6"
        >
          {BOARD_COLUMNS.map((column) => (
            <BoardColumn
              key={column.status}
              columnRef={
                column.status === firstOccupied ? firstOccupiedRef : undefined
              }
              status={column.status}
              label={column.label}
              tasks={columns.get(column.status) ?? []}
              teamById={teamById}
              memberById={memberById}
              scheduled={scheduled}
              onOpen={setOpenTaskId}
              onToggleFlag={toggleFlag}
              onAdd={() => setCreatingIn(column.status)}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <TaskCardBody
              task={activeTask}
              team={teamById.get(activeTask.teamId)!}
              assignee={
                activeTask.assigneeId ? memberById.get(activeTask.assigneeId) ?? null : null
              }
              scheduled={scheduled[activeTask.id]}
              dragging
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {openTask ? (
        <TaskDrawer
          task={openTask}
          teams={teams}
          members={members}
          milestones={milestones}
          workstreams={workstreamList}
          allTasks={tasks}
          scheduled={scheduled[openTask.id]}
          onClose={() => setOpenTaskId(null)}
          onSaved={handleTaskSaved}
        />
      ) : null}

      {creatingIn ? (
        <NewTaskDialog
          status={creatingIn}
          teams={teams}
          members={members}
          milestones={milestones}
          workstreams={workstreamList}
          onWorkstreamCreated={(created) =>
            setWorkstreamList((current) =>
              current.some((w) => w.id === created.id) ? current : [...current, created],
            )
          }
          defaultTeamId={teamFilter === "ALL" ? teams[0]?.id : teamFilter}
          onClose={() => setCreatingIn(null)}
          onCreated={(created) => {
            setCreatingIn(null);
            // A task the active filters would hide looks like a failed save.
            // Relax whichever filter is in the way so the new card is on
            // screen, rather than silently dropping it.
            if (teamFilter !== "ALL" && teamFilter !== created.teamId) {
              setTeamFilter("ALL");
            }
            setAssigneeFilter("ALL");
            // Judge the real task, not a stand-in: a future start date makes
            // it not current even though its end date is ahead of today.
            if (scope === "CURRENT" && !isCurrent(created, today)) {
              setScope("ALL");
            }
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function BoardColumn({
  columnRef,
  status,
  label,
  tasks,
  teamById,
  memberById,
  scheduled,
  onOpen,
  onToggleFlag,
  onAdd,
}: {
  columnRef?: React.MutableRefObject<HTMLElement | null>;
  status: TaskStatus;
  label: string;
  tasks: TaskView[];
  teamById: Map<string, TeamView>;
  memberById: Map<string, MemberView>;
  scheduled: Record<string, ScheduledTask>;
  onOpen: (id: string) => void;
  onToggleFlag: (taskId: string, flagged: boolean) => void;
  onAdd: () => void;
}) {
  // A column-level droppable so an empty column is still a valid drop target.
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={columnRef}
      className={clsx(
        // 86vw leaves a sliver of the next column visible, which is the only
        // cue on a phone that the board scrolls sideways at all.
        "flex w-[86vw] shrink-0 flex-col rounded-xl border transition-colors sm:w-[290px]",
        isOver ? "border-accent/50 bg-elevated/60" : "border-line bg-panel/60",
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-2 uppercase">
          {label}
          <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-ink-3">
            {tasks.length}
          </span>
        </h2>
        <button
          type="button"
          onClick={onAdd}
          data-tour={status === "BACKLOG" ? "add" : undefined}
          aria-label={`Add a task to ${label}`}
          className="rounded p-1.5 text-ink-3 transition-colors hover:bg-elevated hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M8 3a.75.75 0 0 1 .75.75v3.5h3.5a.75.75 0 0 1 0 1.5h-3.5v3.5a.75.75 0 0 1-1.5 0v-3.5h-3.5a.75.75 0 0 1 0-1.5h3.5v-3.5A.75.75 0 0 1 8 3Z" />
          </svg>
        </button>
      </header>

      <div
        ref={setNodeRef}
        data-column-scroll
        className="overscroll-y-contain-safe flex-1 overflow-y-auto px-2 pb-2"
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2">
            {tasks.map((task, index) => (
              <SortableTaskCard
                key={task.id}
                tourAnchor={status === "IN_PROGRESS" && index === 0}
                task={task}
                team={teamById.get(task.teamId)!}
                assignee={task.assigneeId ? memberById.get(task.assigneeId) ?? null : null}
                scheduled={scheduled[task.id]}
                onOpen={onOpen}
                onToggleFlag={onToggleFlag}
              />
            ))}
          </ul>
        </SortableContext>
        {tasks.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-ink-3">
            Drop a card here
          </p>
        ) : null}
      </div>
    </section>
  );
}

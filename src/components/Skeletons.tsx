/**
 * Fallbacks shown while a route streams in.
 *
 * These exist for navigation speed as much as for looks. Every page here is
 * dynamic, and per Next's prefetching rules a dynamic route is not prefetched
 * at all unless it has a loading boundary -- so without these, each tab click
 * waited on a full server round trip before anything moved. With them, the
 * shell is prefetched and appears immediately while the data follows.
 */

export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
      <div className="space-y-3">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-4 w-full max-w-2xl" />
      </div>
      <div className="space-y-3">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-56 w-full" />
      </div>
      <div className="space-y-3">
        <div className="skeleton h-3 w-24" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-36" />
          ))}
        </div>
      </div>
      <span className="sr-only" role="status">
        Loading
      </span>
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div className="skeleton h-7 w-40" />
        <div className="skeleton h-7 w-44" />
        <div className="skeleton h-7 w-36" />
      </div>
      <div className="flex flex-1 gap-3 overflow-hidden px-4 py-4 sm:px-6">
        {Array.from({ length: 5 }, (_, col) => (
          <div
            key={col}
            className="flex w-[290px] shrink-0 flex-col gap-2 rounded-xl border border-line bg-panel/60 p-2"
          >
            <div className="skeleton mb-1 h-5 w-28" />
            {Array.from({ length: 4 - (col % 3) }, (_, i) => (
              <div key={i} className="skeleton h-20" />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only" role="status">
        Loading the board
      </span>
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div className="skeleton h-7 w-36" />
        <div className="skeleton h-7 w-40" />
        <div className="skeleton h-7 w-32" />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-60 shrink-0 space-y-2 border-r border-line p-3">
          {Array.from({ length: 14 }, (_, i) => (
            <div key={i} className="skeleton h-5" style={{ width: `${60 + ((i * 13) % 35)}%` }} />
          ))}
        </div>
        <div className="flex-1 space-y-2 p-3">
          {Array.from({ length: 14 }, (_, i) => (
            <div
              key={i}
              className="skeleton h-4"
              style={{
                width: `${10 + ((i * 17) % 45)}%`,
                marginLeft: `${(i * 23) % 40}%`,
              }}
            />
          ))}
        </div>
      </div>
      <span className="sr-only" role="status">
        Loading the timeline
      </span>
    </div>
  );
}

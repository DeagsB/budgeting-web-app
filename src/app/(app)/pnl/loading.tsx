/**
 * P&L skeleton. Mirrors the real layout - stacked header + month nav, the
 * three-up income/expense/net tiles, the twelve-month bar card, and the
 * top-categories card - so navigating to /pnl gives instant, shape-accurate
 * feedback while the year's transactions resolve.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Header + month nav */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2.5">
          <div className="h-[14px] w-24 rounded-full bg-paper-2 animate-pulse" />
          <div className="h-9 w-64 rounded-md bg-paper-2 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-11 w-11 rounded-full bg-paper-2 animate-pulse" />
          <div className="h-6 w-28 rounded-full bg-paper-2 animate-pulse" />
          <div className="h-11 w-11 rounded-full bg-paper-2 animate-pulse" />
        </div>
      </div>

      {/* Three-up hero tiles */}
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-md border border-hair bg-paper p-4">
            <div className="h-[12px] w-14 rounded-full bg-paper-2 animate-pulse" />
            <div className="mt-2.5 h-7 w-20 rounded-md bg-paper-2 animate-pulse" />
          </div>
        ))}
      </div>

      {/* Twelve-month bar card */}
      <div className="rounded-lg border border-hair bg-paper p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-baseline justify-between">
          <div className="h-[12px] w-28 rounded-full bg-paper-2 animate-pulse" />
          <div className="h-[12px] w-24 rounded-full bg-paper-2 animate-pulse" />
        </div>
        <div className="mt-5 grid grid-cols-12 items-end gap-1.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="rounded-t-sm bg-paper-2 animate-pulse"
              style={{ height: `${40 + ((i * 37) % 90)}px` }}
            />
          ))}
        </div>
        <div className="mt-5 h-4 w-3/4 rounded-full bg-paper-2 animate-pulse" />
      </div>

      {/* Top categories card */}
      <div className="rounded-lg border border-hair bg-paper p-6 shadow-[var(--shadow-card)]">
        <div className="h-[12px] w-40 rounded-full bg-paper-2 animate-pulse" />
        <div className="mt-4 flex flex-col gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="hidden h-4 w-[160px] shrink-0 rounded-full bg-paper-2 animate-pulse sm:block" />
              <div className="h-[28px] flex-1 rounded-md bg-paper-2 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

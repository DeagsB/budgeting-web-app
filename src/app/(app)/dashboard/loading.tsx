/**
 * Dashboard-specific skeleton. Mirrors the default widget layout — greeting,
 * the green net-worth hero, the three-up month-stats row, and the horizontal
 * accounts strip — so navigating to Home gives instant, shape-accurate
 * feedback while the queries resolve.
 *
 * The hero uses the same fixed deep-green gradient as the real surface (a fixed
 * green, not a token, so it never inverts in dark mode).
 */
const HERO_GRADIENT = 'linear-gradient(150deg, #1f5641 0%, #154031 100%)'

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Primary action placeholder */}
      <div className="flex justify-end">
        <div className="h-[46px] w-40 rounded-full bg-paper-2 animate-pulse" />
      </div>

      {/* Greeting */}
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <div className="h-[14px] w-24 rounded-full bg-paper-2 animate-pulse" />
          <div className="h-9 w-52 rounded-md bg-paper-2 animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-11 w-11 rounded-full bg-paper-2 animate-pulse" />
          <div className="h-11 w-11 rounded-full bg-paper-2 animate-pulse" />
        </div>
      </div>

      {/* Net-worth hero */}
      <div
        className="overflow-hidden rounded-xl p-6 shadow-[var(--shadow-card)] md:p-8"
        style={{ background: HERO_GRADIENT }}
      >
        <div className="h-[12px] w-20 rounded-full bg-white/20 animate-pulse" />
        <div className="mt-3 h-12 w-56 rounded-md bg-white/15 animate-pulse" />
        <div className="mt-4 h-5 w-40 rounded-full bg-white/10 animate-pulse" />
        <div className="mt-5 h-[120px] w-full rounded-md bg-white/[0.07] animate-pulse" />
      </div>

      {/* Three-up month stats */}
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-md border border-hair bg-paper p-4">
            <div className="h-[12px] w-12 rounded-full bg-paper-2 animate-pulse" />
            <div className="mt-2.5 h-7 w-20 rounded-md bg-paper-2 animate-pulse" />
          </div>
        ))}
      </div>

      {/* Accounts strip */}
      <div className="flex flex-col gap-3">
        <div className="h-[14px] w-20 rounded-full bg-paper-2 animate-pulse" />
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[150px] w-[240px] shrink-0 rounded-md border border-hair bg-paper animate-pulse md:w-full"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

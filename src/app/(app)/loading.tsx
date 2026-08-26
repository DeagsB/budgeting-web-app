/**
 * Shown while a route segment under (app)/ is fetching data on navigation.
 * Maple-styled skeleton so tapping a tab on the bottom bar gives instant
 * visual feedback even if the new page's queries take a moment.
 *
 * Three vertically stacked stripes matches the rhythm of every page in the
 * app (header, hero card, content section) without committing to any one
 * layout - looks at home everywhere from /dashboard to /transactions.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Page label + serif title */}
      <div className="flex flex-col gap-2.5">
        <div className="h-[14px] w-24 rounded-full bg-[var(--color-paper-2)] animate-pulse" />
        <div className="h-10 w-3/4 rounded-md bg-[var(--color-paper-2)] animate-pulse" />
      </div>

      {/* Hero card */}
      <div className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6">
        <div className="h-[14px] w-20 rounded-full bg-[var(--color-paper-2)] animate-pulse" />
        <div className="mt-3 h-9 w-48 rounded-md bg-[var(--color-paper-2)] animate-pulse" />
        <div className="mt-5 h-2.5 w-full rounded-full bg-[var(--color-paper-2)] animate-pulse" />
      </div>

      {/* Three-up tile row */}
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-[18px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-4"
          >
            <div className="h-[12px] w-12 rounded-full bg-[var(--color-paper-2)] animate-pulse" />
            <div className="mt-2.5 h-7 w-20 rounded-md bg-[var(--color-paper-2)] animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}

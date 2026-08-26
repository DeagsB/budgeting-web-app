/**
 * Turn a raw Postgres / PostgREST / fetch error into a sentence a person can
 * act on. Server actions should never hand `error.message` straight to the UI:
 * the raw text names constraints and tables the user has never heard of.
 *
 * `ctx.entity` is the human noun for the thing being saved ("account",
 * "category", "rule") and is only used by the unique-violation message.
 */
export type DbErrorLike = { code?: string | null; message?: string | null; name?: string | null } | null | undefined

export const GENERIC_SAVE_ERROR = "Couldn't save that. Refresh and try again."
export const OFFLINE_ERROR = 'You look offline. Check your connection and try again.'
export const NOT_OWNER_ERROR = 'You can only change what you own.'

export function humanizeDbError(err: DbErrorLike, ctx: { entity?: string } = {}): string {
  if (!err) return GENERIC_SAVE_ERROR
  const code = (err.code ?? '').trim()
  const message = err.message ?? ''
  const entity = ctx.entity ?? 'name'

  switch (code) {
    case '23505':
      return `That ${entity} is already in use. Pick a different one.`
    case '23503':
      return 'This is still in use somewhere. Archive it instead of removing it.'
    case '42501':
    case 'PGRST301':
      return NOT_OWNER_ERROR
    case '23514':
      return 'That value is out of range.'
    case '22P02':
      return 'Something in that form was not in the expected format.'
  }

  if (/row-level security|permission denied|violates row-level/i.test(message)) return NOT_OWNER_ERROR
  if (err.name === 'TypeError' || /failed to fetch|fetch failed|network ?error|ECONNREFUSED|ENOTFOUND/i.test(message)) {
    return OFFLINE_ERROR
  }
  return GENERIC_SAVE_ERROR
}

/** Same mapping for thrown values (Error instances, unknown rejections). */
export function humanizeError(e: unknown, ctx: { entity?: string } = {}): string {
  if (e && typeof e === 'object') return humanizeDbError(e as DbErrorLike, ctx)
  return GENERIC_SAVE_ERROR
}

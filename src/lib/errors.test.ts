import { describe, expect, it } from 'vitest'
import { GENERIC_SAVE_ERROR, NOT_OWNER_ERROR, OFFLINE_ERROR, humanizeDbError, humanizeError } from './errors'

describe('humanizeDbError', () => {
  it('unique violation names the entity', () => {
    expect(humanizeDbError({ code: '23505', message: 'duplicate key value violates unique constraint "accounts_name_key"' }, { entity: 'account name' })).toBe(
      'That account name is already in use. Pick a different one.',
    )
    expect(humanizeDbError({ code: '23505' })).toBe('That name is already in use. Pick a different one.')
  })

  it('foreign key violation suggests archiving', () => {
    expect(humanizeDbError({ code: '23503', message: 'violates foreign key constraint' })).toBe(
      'This is still in use somewhere. Archive it instead of removing it.',
    )
  })

  it('RLS denials by code or message', () => {
    expect(humanizeDbError({ code: '42501', message: 'permission denied for table accounts' })).toBe(NOT_OWNER_ERROR)
    expect(humanizeDbError({ code: 'PGRST301', message: 'JWT expired' })).toBe(NOT_OWNER_ERROR)
    expect(humanizeDbError({ code: '', message: 'new row violates row-level security policy for table "transactions"' })).toBe(NOT_OWNER_ERROR)
  })

  it('check and cast failures', () => {
    expect(humanizeDbError({ code: '23514' })).toBe('That value is out of range.')
    expect(humanizeDbError({ code: '22P02', message: 'invalid input syntax for type uuid' })).toBe(
      'Something in that form was not in the expected format.',
    )
  })

  it('network failures look offline', () => {
    expect(humanizeDbError({ name: 'TypeError', message: 'Failed to fetch' })).toBe(OFFLINE_ERROR)
    expect(humanizeDbError({ message: 'fetch failed' })).toBe(OFFLINE_ERROR)
  })

  it('anything else falls back to the generic sentence', () => {
    expect(humanizeDbError({ code: 'XX000', message: 'internal error' })).toBe(GENERIC_SAVE_ERROR)
    expect(humanizeDbError(null)).toBe(GENERIC_SAVE_ERROR)
    expect(humanizeDbError(undefined)).toBe(GENERIC_SAVE_ERROR)
  })

  it('never echoes the raw message', () => {
    const raw = 'duplicate key value violates unique constraint "x"'
    expect(humanizeDbError({ code: '23505', message: raw })).not.toContain('constraint')
  })
})

describe('humanizeError', () => {
  it('handles thrown Errors and non-objects', () => {
    expect(humanizeError(new TypeError('Failed to fetch'))).toBe(OFFLINE_ERROR)
    expect(humanizeError('boom')).toBe(GENERIC_SAVE_ERROR)
    expect(humanizeError(undefined)).toBe(GENERIC_SAVE_ERROR)
  })
})

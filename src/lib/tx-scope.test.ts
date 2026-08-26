import { describe, expect, it } from 'vitest'
import { classifyTx, isTxEditable, ownershipLabel, parseScope, scopeLabel } from './tx-scope'

describe('isTxEditable', () => {
  it('visible account is always editable', () => {
    expect(isTxEditable({ accountVisible: true, payerId: 'other', myMemberId: 'me' })).toBe(true)
    expect(isTxEditable({ accountVisible: true, payerId: null, myMemberId: null })).toBe(true)
  })

  it('own payment on a hidden account is editable', () => {
    expect(isTxEditable({ accountVisible: false, payerId: 'me', myMemberId: 'me' })).toBe(true)
  })

  it("another member's payment on a hidden account is read-only", () => {
    expect(isTxEditable({ accountVisible: false, payerId: 'other', myMemberId: 'me' })).toBe(false)
  })

  it('unclaimed login never edits hidden-account rows', () => {
    expect(isTxEditable({ accountVisible: false, payerId: 'other', myMemberId: null })).toBe(false)
    expect(isTxEditable({ accountVisible: false, payerId: null, myMemberId: null })).toBe(false)
  })
})

describe('classifyTx', () => {
  it('editable with no shares is mine', () => {
    expect(classifyTx({ editable: true, shareCount: 0 })).toBe('mine')
  })
  it('editable with shares is shared', () => {
    expect(classifyTx({ editable: true, shareCount: 2 })).toBe('shared')
  })
  it('read-only is shared-with-me regardless of share count', () => {
    expect(classifyTx({ editable: false, shareCount: 1 })).toBe('with-me')
    expect(classifyTx({ editable: false, shareCount: 0 })).toBe('with-me')
  })
})

describe('parseScope / scopeLabel', () => {
  it('accepts the three scopes and rejects everything else', () => {
    expect(parseScope('mine')).toBe('mine')
    expect(parseScope('shared')).toBe('shared')
    expect(parseScope('with-me')).toBe('with-me')
    expect(parseScope('')).toBeNull()
    expect(parseScope(undefined)).toBeNull()
    expect(parseScope('11111111-1111-1111-1111-111111111111')).toBeNull()
  })
  it('labels', () => {
    expect(scopeLabel('with-me')).toBe('Shared with me')
    expect(scopeLabel(null)).toBeNull()
  })
})

describe('ownershipLabel', () => {
  it('maps enum to Mine / Joint', () => {
    expect(ownershipLabel('member')).toBe('Mine')
    expect(ownershipLabel('shared')).toBe('Joint')
  })
})

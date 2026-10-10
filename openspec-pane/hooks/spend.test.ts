import { describe, expect, test } from 'claude-code/testing'

import { addSpend, changeTotal, parseOpsx, usageTokens } from './spend'

describe('spend', () => {
  test('parseOpsx reads the step and optional change name', () => {
    expect(parseOpsx('/opsx:apply add-dark-mode-toggle')).toEqual({ step: 'apply', change: 'add-dark-mode-toggle' })
    expect(parseOpsx('/opsx:verify')).toEqual({ step: 'verify', change: null })
    expect(parseOpsx('  /opsx:bulk-archive  ')).toEqual({ step: 'bulk-archive', change: null })
    expect(parseOpsx('please run /opsx:apply')).toBe(null)
    expect(parseOpsx('/opsx-change foo')).toBe(null)
  })

  test('usageTokens sums every token kind', () => {
    expect(usageTokens({ input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 300, cache_creation_input_tokens: 40 })).toBe(370)
  })

  test('addSpend accumulates per change and step without mutating', () => {
    const empty = {}
    const one = addSpend(empty, { change: 'a', step: 'apply' }, { tokens: 100 })
    const two = addSpend(one, { change: 'a', step: 'apply' }, { usd: 0.5 })
    const three = addSpend(two, { change: 'a', step: 'verify' }, { tokens: 7, usd: 0.1 })
    expect(empty).toEqual({})
    expect(three).toEqual({ a: { apply: { tokens: 100, usd: 0.5 }, verify: { tokens: 7, usd: 0.1 } } })
  })

  test('addSpend ignores spend with no current step', () => {
    const ledger = { a: { apply: { tokens: 1, usd: 1 } } }
    expect(addSpend(ledger, null, { tokens: 999 })).toBe(ledger)
  })

  test('changeTotal sums a change across steps', () => {
    expect(changeTotal({ apply: { tokens: 100, usd: 0.5 }, verify: { tokens: 7, usd: 0.1 } })).toEqual({ tokens: 107, usd: 0.6 })
    expect(changeTotal(undefined)).toEqual({ tokens: 0, usd: 0 })
  })
})

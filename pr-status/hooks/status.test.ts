import { expect, test } from 'claude-code/testing'
import { classifyFailure, countChecks, paneRows, parsePr } from './status'

test('parses the number, title and review decision from gh pr view', () => {
  const json = '{"number":12,"title":"Add guard","reviewDecision":"APPROVED"}'
  expect(parsePr(json)).toEqual({ number: 12, title: 'Add guard', review: 'approved' })
})

test('an empty review decision reads as no review yet', () => {
  const json = '{"number":3,"title":"Draft","reviewDecision":""}'
  expect(parsePr(json).review).toBe('no review yet')
})

test('counts check buckets into passing, failing and pending', () => {
  const json = '[{"bucket":"pass"},{"bucket":"pass"},{"bucket":"fail"},{"bucket":"pending"}]'
  expect(countChecks(json)).toEqual({ passing: 2, failing: 1, pending: 1 })
})

test('unreadable check output counts as nothing', () => {
  expect(countChecks('not json')).toEqual({ passing: 0, failing: 0, pending: 0 })
})

test('a branch without a PR is none; any other failure is unavailable', () => {
  expect(classifyFailure('no pull requests found for branch "x"')).toBe('none')
  expect(classifyFailure('gh: command not found')).toBe('unavailable')
})

test('the pane lists the PR, its review and the checks, one row each', () => {
  const rows = paneRows({
    kind: 'pr',
    number: 12,
    title: 'Add guard',
    review: 'approved',
    checks: { passing: 2, failing: 1, pending: 0 },
  })
  expect(rows).toEqual([
    { label: 'PR', value: '#12 Add guard' },
    { label: 'Review', value: 'approved' },
    { label: 'Checks', value: '2 passing, 1 failing, 0 pending' },
  ])
})

test('the pane says so when there is no PR or gh is unavailable', () => {
  expect(paneRows({ kind: 'none' })).toEqual([{ label: 'PR', value: 'no PR for this branch' }])
  expect(paneRows({ kind: 'unavailable' })).toEqual([{ label: 'PR', value: 'PR status unavailable' }])
})

test('before the first check the pane says so', () => {
  expect(paneRows(null)).toEqual([{ label: 'PR', value: 'checking…' }])
})

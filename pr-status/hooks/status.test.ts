import { expect, test } from 'claude-code/testing'
import { bandText, countChecks, parsePr, classifyFailure } from './status'

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

test('the band names the PR, its review and the checks', () => {
  const text = bandText({
    kind: 'pr',
    number: 12,
    title: 'Add guard',
    review: 'approved',
    checks: { passing: 2, failing: 1, pending: 0 },
  })
  expect(text).toBe('#12 Add guard · approved · checks: 2 passing, 1 failing, 0 pending')
})

test('the band says so when there is no PR or gh is unavailable', () => {
  expect(bandText({ kind: 'none' })).toBe('no PR for this branch')
  expect(bandText({ kind: 'unavailable' })).toBe('PR status unavailable')
})

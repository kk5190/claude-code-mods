import { expect, test } from 'claude-code/testing'
import { authorWarnings, isPublishCommand, paneLines, parseCommits, summarize } from './guard'

test('git push and gh pr create are publish commands', () => {
  expect(isPublishCommand('git push origin main')).toBe(true)
  expect(isPublishCommand('gh pr create --fill')).toBe(true)
})

test('other git and gh commands are not', () => {
  expect(isPublishCommand('git status')).toBe(false)
  expect(isPublishCommand('git pull --rebase')).toBe(false)
  expect(isPublishCommand('gh pr view')).toBe(false)
})

test('parses one commit per tab-separated log line', () => {
  const stdout = 'kk5190\tkk5190@users.noreply.github.com\tAdd cost guardian\n'
  expect(parseCommits(stdout)).toEqual([
    { name: 'kk5190', email: 'kk5190@users.noreply.github.com', subject: 'Add cost guardian' },
  ])
})

test('no output means no commits', () => {
  expect(parseCommits('')).toEqual([])
})

test('flags commits whose author is neither the name nor the email', () => {
  const commits = [
    { name: 'kk5190', email: 'a@b.c', subject: 'ok' },
    { name: 'Someone Else', email: 'x@y.z', subject: 'not ok' },
  ]
  expect(authorWarnings(commits)).toEqual(['Someone Else <x@y.z>: not ok'])
})

test('a kk5190 email counts even when the name differs', () => {
  const commits = [{ name: 'Krishna', email: 'kk5190@users.noreply.github.com', subject: 'ok' }]
  expect(authorWarnings(commits)).toEqual([])
})

test('summary lists each commit and the shortstat', () => {
  const commits = [{ name: 'kk5190', email: 'a@b.c', subject: 'Add guard' }]
  const text = summarize(commits, ' 3 files changed, 40 insertions(+)')
  expect(text).toContain('1 commit')
  expect(text).toContain('Add guard')
  expect(text).toContain('3 files changed')
})

test('the pane says so before any publish command has been checked', () => {
  expect(paneLines(null)).toEqual(['No publish command checked yet.'])
})

test('the pane shows the command, the commits, any author warning and the outcome', () => {
  const lines = paneLines({
    command: 'git push origin main',
    lines: ['1 commit', '  Add guard'],
    warnings: ['Someone <x@y.z>: stray'],
    outcome: 'checking',
  })
  expect(lines).toEqual([
    'Command: git push origin main',
    '1 commit',
    '  Add guard',
    'Author check failed: Someone <x@y.z>: stray',
    'Outcome: waiting for your answer',
  ])
})

test('each outcome has its own wording in the pane', () => {
  const base = { command: 'git push', lines: [], warnings: [] }
  expect(paneLines({ ...base, outcome: 'continued' }).at(-1)).toBe('Outcome: continued')
  expect(paneLines({ ...base, outcome: 'cancelled' }).at(-1)).toBe('Outcome: cancelled')
  expect(paneLines({ ...base, outcome: 'refused' }).at(-1)).toBe('Outcome: refused, the command did not run')
})

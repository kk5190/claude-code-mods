import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Check, Outcome } from '../types'
import { authorWarnings, isPublishCommand, paneLines, parseCommits, summarize } from './guard'

const PANE = 'push-guard'
const TITLE = 'Push guard'

const LOG = ['git', 'log', '--format=%an%x09%ae%x09%s', '@{u}..HEAD']
const STAT = ['git', 'diff', '--shortstat', '@{u}..HEAD']

const lastCheck = atom({ plugin: 'push-guard', key: 'lastCheck' } as const, null)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'push-guard', description: 'Show the push guard pane' })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'push-guard' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Push guard pane opened.' }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!isPublishCommand(e.command)) return next(e)

    const settle = (check: Check, outcome: Outcome) => update($, lastCheck, () => ({ ...check, outcome }))

    let check: Check
    let question: string
    try {
      const log = await $.process.run(LOG)
      const stat = await $.process.run(STAT)
      const commits = log.exitCode === 0 ? parseCommits(log.stdout) : []
      const body =
        log.exitCode === 0 ? summarize(commits, stat.stdout) : 'Could not list the commits (no upstream branch?).'
      const warnings = authorWarnings(commits)
      const warn = warnings.length > 0 ? `\nAuthor check failed:\n  ${warnings.join('\n  ')}` : ''
      question = `Run: ${e.command}\n${body}${warn}`
      check = { command: e.command, lines: body.split('\n'), warnings, outcome: 'checking' }
    } catch {
      await update($, lastCheck, () => ({
        command: e.command,
        lines: ['Could not read the commits.'],
        warnings: [],
        outcome: 'refused',
      }))
      return { deny: 'push-guard: could not read the commits, so the command was not run' }
    }

    await update($, lastCheck, () => check)

    try {
      const answer = await $.ui.ask(question, ['Continue', 'Cancel'])
      if (answer !== 'Continue') {
        await settle(check, 'cancelled')
        return { deny: 'push-guard: cancelled' }
      }
    } catch {
      await settle(check, 'refused')
      return { deny: 'push-guard: no answer, so the command was not run' }
    }

    await settle(check, 'continued')
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'push-guard: its check failed, so the command was not run' }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const lines = paneLines(await read($, lastCheck))

    return (
      <Box flexDirection="column" paddingX={1}>
        {lines.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Box>
    )
  })
}

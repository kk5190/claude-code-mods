import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PrStatus } from '../types'
import { classifyFailure, countChecks, paneRows, parsePr } from './status'

const PANE = 'pr-status'
const TITLE = 'PR status'

const status = atom({ plugin: 'pr-status', key: 'status' } as const, null)

// Asks gh about the current branch's PR. A failed or unreadable answer shows as unavailable, never as an error.
const refresh = async ($: EngineInterface) => {
  let next: PrStatus
  try {
    const view = await $.process.run(['gh', 'pr', 'view', '--json', 'number,title,reviewDecision'])
    if (view.exitCode !== 0) {
      next = { kind: classifyFailure(view.stderr) }
    } else {
      const { number, title, review } = parsePr(view.stdout)
      const checks = await $.process.run(['gh', 'pr', 'checks', '--json', 'bucket'])
      next = { kind: 'pr', number, title, review, checks: countChecks(checks.stdout) }
    }
  } catch {
    next = { kind: 'unavailable' }
  }
  await update($, status, () => next)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pr-status', description: 'Show the PR status pane' })
    void $.ui.open({ id: PANE, title: TITLE })
    await refresh($)

    return next(e)
  })

  on('command.run', { command: 'pr-status' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'PR status pane opened.' }
  })

  // A turn is where a push or a PR change happens, so the pane refreshes when one ends.
  on('turn.complete', async ($, e, next) => {
    await refresh($)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const rows = paneRows(await read($, status))

    return (
      <Box flexDirection="column" paddingX={1}>
        {rows.map(row => (
          <Box key={row.label} flexDirection="column">
            <Text dimColor>{row.label}</Text>
            <Text>{row.value}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}

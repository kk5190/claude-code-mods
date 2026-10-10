import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PrStatus } from '../types'
import { bandText, classifyFailure, countChecks, parsePr } from './status'

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
    await refresh($)

    return next(e)
  })

  // A turn is where a push or a PR change happens, so the band refreshes when one ends.
  on('turn.complete', async ($, e, next) => {
    await refresh($)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, status)

    if (e.props.hasSurvey || current === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box paddingX={1}>
        <Text dimColor>{bandText(current)}</Text>
      </Box>
    )
  })
}

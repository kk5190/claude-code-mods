import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Reading } from '../types'
import { budgetRow, budgetToast, overBudget, turnCost } from './cost'

// Every turn re-sends the whole context, so absolute size drives cost more than percent of the window.
const WARN_TOKENS = 100_000
const ALERT_TOKENS = 200_000

// Warn when a single turn costs at least this much (USD). Warning only, never blocks.
const TURN_WARN_USD = 0.5
// Off by default. Set a number to warn once when the session total reaches it.
const SESSION_BUDGET_USD: number | undefined = undefined

const PANE = 'context-meter'
const TITLE = 'Context'

const reading = atom({ plugin: 'context-meter', key: 'reading' } as const, null)
const hasWarned = atom({ plugin: 'context-meter', key: 'hasWarned' } as const, false)
const lastUsd = atom({ plugin: 'context-meter', key: 'lastUsd' } as const, undefined as number | undefined)
const turnWarned = atom({ plugin: 'context-meter', key: 'turnWarned' } as const, false)
const budgetWarned = atom({ plugin: 'context-meter', key: 'budgetWarned' } as const, false)

const k = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`)

const level = (tokens: number) =>
  tokens >= ALERT_TOKENS
    ? ({ color: 'error', status: 'Compact now' } as const)
    : tokens >= WARN_TOKENS
      ? ({ color: 'warning', status: 'Growing' } as const)
      : ({ color: 'success', status: 'Healthy' } as const)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'context-meter', description: 'Show the context meter pane' })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'context-meter' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Context meter opened.' }
  })

  on('session.measure', async ($, e, next) => {
    const { tokens, window, percent } = e.context
    const usd = e.cost?.usd
    const turn = usd === undefined ? undefined : turnCost(await read($, lastUsd), usd)
    const latest: Reading | null =
      tokens === undefined ? null : { tokens, window, percent: percent ?? 0, usd, turnUsd: turn }
    await update($, reading, () => latest)

    // Toast once per crossing; compacting or clearing below the line re-arms it.
    const isOver = latest !== null && latest.tokens >= ALERT_TOKENS
    if (isOver && !(await read($, hasWarned))) {
      $.ui.toast(`Context is ${k(latest.tokens)} and re-sent every turn: consider /compact or /clear`)
    }
    await update($, hasWarned, () => isOver)

    if (usd !== undefined) {
      // A reading without cost leaves the baseline alone, so the next turn is measured from the last known total.
      await update($, lastUsd, () => usd)

      // Dropping back under the line re-arms the turn warning.
      const isTurnOver = turn !== undefined && turn >= TURN_WARN_USD
      if (isTurnOver && !(await read($, turnWarned))) {
        $.ui.toast(`That turn cost $${turn.toFixed(2)}`)
      }
      await update($, turnWarned, () => isTurnOver)

      // The budget warning stays set for the rest of the session.
      if (overBudget(usd, SESSION_BUDGET_USD) && !(await read($, budgetWarned))) {
        $.ui.toast(budgetToast(usd, SESSION_BUDGET_USD!))
        await update($, budgetWarned, () => true)
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const r = await read($, reading)

    if (r === null) {
      return (
        <Box paddingX={1}>
          <Text dimColor>Waiting for the first response…</Text>
        </Box>
      )
    }

    const { color, status } = level(r.tokens)
    const cells = Math.max(10, e.props.bodyColumns - 2)
    const filled = Math.min(cells, Math.ceil((r.tokens / r.window) * cells))
    const row = (label: string, value: string, valueColor?: typeof color) => (
      <Box flexDirection="row" justifyContent="space-between">
        <Text dimColor>{label}</Text>
        <Text color={valueColor} bold={valueColor !== undefined}>{value}</Text>
      </Box>
    )

    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color={color}>{`${r.percent}%`}</Text>
        <Box flexDirection="row">
          <Text color={color}>{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(cells - filled)}</Text>
        </Box>
        <Text dimColor>{`${k(r.tokens)} of ${k(r.window)} tokens`}</Text>
        <Box marginTop={1} flexDirection="column">
          {row('Status', status, color)}
          {row('Re-sent each turn', k(r.tokens))}
          {r.usd !== undefined && row('Session cost', `$${r.usd.toFixed(2)}`)}
          {r.turnUsd !== undefined && (
            <>
              {row('Last turn', `$${r.turnUsd.toFixed(2)}`, r.turnUsd >= TURN_WARN_USD ? 'warning' : undefined)}
              {row('Next turn ≈', `$${r.turnUsd.toFixed(2)}`)}
            </>
          )}
          {r.usd !== undefined && budgetRow(r.usd, SESSION_BUDGET_USD) && row('Budget', budgetRow(r.usd, SESSION_BUDGET_USD)!)}
        </Box>
        {r.tokens >= ALERT_TOKENS && (
          <Box marginTop={1}>
            <Text color="error">Run /compact or /clear</Text>
          </Box>
        )}
      </Box>
    )
  })
}

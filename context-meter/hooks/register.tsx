import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Reading } from '../types'

// Every turn re-sends the whole context, so absolute size drives cost more than percent of the window.
const WARN_TOKENS = 100_000
const ALERT_TOKENS = 200_000

const PANE = 'context-meter'
const TITLE = 'Context'

const reading = atom({ plugin: 'context-meter', key: 'reading' } as const, null)
const hasWarned = atom({ plugin: 'context-meter', key: 'hasWarned' } as const, false)

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
    const latest: Reading | null =
      tokens === undefined ? null : { tokens, window, percent: percent ?? 0, usd: e.cost?.usd }
    await update($, reading, () => latest)

    // Toast once per crossing; compacting or clearing below the line re-arms it.
    const isOver = latest !== null && latest.tokens >= ALERT_TOKENS
    if (isOver && !(await read($, hasWarned))) {
      $.ui.toast(`Context is ${k(latest.tokens)} and re-sent every turn: consider /compact or /clear`)
    }
    await update($, hasWarned, () => isOver)

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

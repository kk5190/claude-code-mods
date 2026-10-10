import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ChangeDetail, Current, Ledger, Project } from '../types'
import { firstUnchecked, nextSteps, parseList, parseStatus, pickActive } from './openspec'
import { addSpend, changeTotal, parseOpsx, usageTokens } from './spend'

const PANE = 'openspec-pane'
const TITLE = 'OpenSpec'
const POLL_MS = 10_000
const MISSING_CLI = 'openspec CLI not found — npm i -g @fission-ai/openspec'

const project = atom({ plugin: 'openspec-pane', key: 'project' } as const, null)
const detail = atom({ plugin: 'openspec-pane', key: 'detail' } as const, null)
const active = atom({ plugin: 'openspec-pane', key: 'active' } as const, null)
const current = atom({ plugin: 'openspec-pane', key: 'current' } as const, null)
const ledger = atom({ plugin: 'openspec-pane', key: 'ledger' } as const, {})
const error = atom({ plugin: 'openspec-pane', key: 'error' } as const, null)
const showOthers = atom({ plugin: 'openspec-pane', key: 'showOthers' } as const, false)

const k = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`)

// Cost is a session running total; a reload starts this over so its first reading only sets the baseline.
let lastUsd: number | null = null


const openspec = async ($: EngineInterface, args: string[]) => {
  try {
    return await $.process.run(['openspec', ...args])
  } catch {
    throw new Error(MISSING_CLI)
  }
}

const refresh = async ($: EngineInterface): Promise<Project | null> => {
  try {
    const listed = await openspec($, ['list', '--json'])
    let found: Project | null
    try {
      found = parseList(listed.stdout)
    } catch {
      throw new Error(`openspec list failed: ${(listed.stderr || listed.stdout).split('\n')[0]}`)
    }
    const before = await read($, project)
    await update($, project, () => found)
    if (found === null) {
      await update($, detail, () => null)
      await update($, error, () => null)
      return null
    }
    if (before?.root !== found.root) {
      const saved = ((await $.store.get(`ledger:${found.root}`)) as Ledger | undefined) ?? {}
      await update($, ledger, () => saved)
    }
    const chosen = ((await $.store.get(`active:${found.root}`)) as string | undefined) ?? null
    const name = pickActive(found.changes, chosen)
    await update($, active, () => name)
    let next: ChangeDetail | null = null
    if (name !== null) {
      const status = parseStatus((await openspec($, ['status', '--change', name, '--json'])).stdout)
      const tasks = status.tasksPath ? await $.fs.read(status.tasksPath) : ''
      next = { name, artifacts: status.artifacts, nextTask: firstUnchecked(String(tasks)) }
    }
    await update($, detail, () => next)
    await update($, error, () => null)
    return found
  } catch (err) {
    await update($, error, () => (err instanceof Error ? err.message : String(err)))
    return read($, project)
  }
}

const choose = async ($: EngineInterface, name: string) => {
  const p = await read($, project)
  if (!p?.changes.some(c => c.name === name)) return false
  await $.store.set(`active:${p.root}`, name)
  await update($, showOthers, () => false)
  await refresh($)
  return true
}

// `/opsx:<step> [change]` from the prompt or as a slash command: switch change if it exists, start the step.
const startStep = async ($: EngineInterface, text: string) => {
  const opsx = parseOpsx(text)
  if (!opsx) return
  if (opsx.change) await choose($, opsx.change)
  const name = await read($, active)
  await update($, current, () => (name ? ({ change: name, step: opsx.step } satisfies Current) : null))
}

const spend = async ($: EngineInterface, add: { tokens?: number; usd?: number }) => {
  const cur = await read($, current)
  const p = await read($, project)
  if (!cur || !p) return
  const next = await update($, ledger, l => addSpend(l, cur, add))
  await $.store.set(`ledger:${p.root}`, next)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'opsx-change', description: 'Show the OpenSpec pane, or switch the active change' })
    if (await refresh($)) void $.ui.open({ id: PANE, title: TITLE })
    $.clock.every(POLL_MS, () => void read($, project).then(p => p && refresh($)))
    return next(e)
  })

  on('command.run', { command: 'opsx-change' }, async ($, e) => {
    const p = await refresh($)
    if (!p) return { text: 'No OpenSpec project here' }
    const name = e.args.trim()
    if (name && !(await choose($, name))) return { text: `No change named ${name}` }
    if (!name) await update($, showOthers, () => true)
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: name ? `Active change: ${name}` : 'OpenSpec pane opened.' }
  })

  on('command.run', async ($, e, next) => {
    if (e.command.startsWith('opsx:')) await startStep($, `/${e.command} ${e.args}`)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await startStep($, e.text)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.usage) await spend($, { tokens: usageTokens(e.usage) })
    await refresh($)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const usd = e.cost?.usd
    if (usd !== undefined) {
      if (lastUsd !== null && usd > lastUsd) await spend($, { usd: usd - lastUsd })
      lastUsd = usd
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await update($, current, () => null)
    lastUsd = null
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const path = (e as { file_path?: unknown }).file_path
    if (typeof path === 'string' && path.includes('/openspec/')) void refresh($)
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const p = await read($, project)
    const d = await read($, detail)
    const cur = await read($, current)
    const spent = await read($, ledger)
    const problem = await read($, error)
    const expanded = await read($, showOthers)
    const width = Math.max(20, e.props.bodyColumns - 2)
    const cut = (s: string) => (s.length > width ? `${s.slice(0, width - 1)}…` : s)

    const change = d && p?.changes.find(c => c.name === d.name)
    const others = (p?.changes ?? []).filter(c => c.status !== 'complete' && c.name !== d?.name)
    const steps = spent[d?.name ?? ''] ?? {}
    const total = changeTotal(steps)
    const filled = change && change.totalTasks > 0 ? Math.round((change.completedTasks / change.totalTasks) * width) : 0
    const row = (label: string, s: { tokens: number; usd: number }) =>
      `${label.padEnd(11)}${`${k(s.tokens)} tok`.padStart(10)}${`$${s.usd.toFixed(2)}`.padStart(9)}`

    return (
      <Box flexDirection="column" paddingX={1}>
        {problem !== null && <Text color="error">{problem}</Text>}
        {!change && problem === null && <Text dimColor>No change in progress</Text>}
        {change && d && (
          <Box flexDirection="column">
            <Text bold>{cut(d.name)}</Text>
            <Text>{cut(d.artifacts.map(a => `${a.present ? '●' : '○'} ${a.id}`).join(' '))}</Text>
            <Box flexDirection="row">
              <Text color="success">{'█'.repeat(filled)}</Text>
              <Text dimColor>{'░'.repeat(width - filled)}</Text>
            </Box>
            <Text dimColor>{`${change.completedTasks}/${change.totalTasks} tasks`}</Text>
            {d.nextTask && <Text>{cut(`Next: ${d.nextTask}`)}</Text>}

            {Object.keys(steps).length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text dimColor>Spend on this change</Text>
                {Object.entries(steps).map(([step, s]) => (
                  <Text color={cur?.change === d.name && cur.step === step ? 'claude' : undefined}>
                    {row(cur?.change === d.name && cur.step === step ? `${step} ▸` : step, s)}
                  </Text>
                ))}
                <Text bold>{row('Total', total)}</Text>
              </Box>
            )}

            <Box flexDirection="row" gap={1} marginTop={1}>
              {nextSteps(change, d.artifacts).map(step => (
                <Button
                  key={`step-${step}`}
                  label={step[0]!.toUpperCase() + step.slice(1)}
                  onPress={() => $.prompt.fill({ text: `/opsx:${step} ${d.name}`, mode: 'replace' })}
                />
              ))}
              {others.length > 0 && (
                <Button key="others" plain label={`${others.length} other`} onPress={() => update($, showOthers, v => !v)} />
              )}
            </Box>
          </Box>
        )}
        {expanded && others.map(c => (
          <Button key={`pick-${c.name}`} plain label={cut(`${c.name}  ${c.completedTasks}/${c.totalTasks}`)} onPress={() => choose($, c.name)} />
        ))}
      </Box>
    )
  })
}

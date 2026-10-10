import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ChangeDetail, Current, Ledger, Project } from '../types'
import { availableSteps, firstUnchecked, nextSteps, parseList, parseStatus, pickActive } from './openspec'
import { addSpend, changeTotal, parseOpsx, usageTokens } from './spend'

const PANE = 'openspec-pane'
const TITLE = 'OpenSpec'
const POLL_MS = 10_000
const CLI_TIMEOUT_MS = 5000
const WRITING_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']
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

// Each refresh takes a number; an older, slower run stops writing once a newer one has started.
let generation = 0
let poll: { cancel: () => void } | null = null

const openspec = async ($: EngineInterface, args: string[]) => {
  try {
    return await $.process.run(['openspec', ...args], { timeoutMs: CLI_TIMEOUT_MS })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/time(d)?[ -]?out/i.test(msg)) throw new Error('openspec timed out')
    if (/ENOENT|not found|no such file|cannot start|could not start/i.test(msg)) throw new Error(MISSING_CLI)
    throw new Error(`openspec failed: ${msg.split('\n')[0]}`)
  }
}

// The `/opsx:` commands installed in the project; null when the folder is missing (e.g. skills-only setups).
const installedCommands = async ($: EngineInterface, root: string): Promise<string[] | null> => {
  try {
    const entries = await $.fs.list(`${root}/.claude/commands/opsx`)
    return entries.filter(e => e.name.endsWith('.md')).map(e => e.name.slice(0, -3))
  } catch {
    return null
  }
}

const refresh = async ($: EngineInterface): Promise<Project | null> => {
  const gen = ++generation
  const stale = () => gen !== generation
  try {
    const listed = await openspec($, ['list', '--json'])
    if (stale()) return read($, project)
    let found: Project | null
    try {
      found = parseList(listed.stdout)
    } catch {
      throw new Error(`openspec list failed: ${(listed.stderr || listed.stdout).split('\n')[0]}`)
    }
    const before = await read($, project)
    if (stale()) return read($, project)
    await update($, project, () => found)
    if (found === null) {
      await update($, detail, () => null)
      await update($, error, () => null)
      return null
    }
    if (before?.root !== found.root) {
      const saved = ((await $.store.get(`ledger:${found.root}`)) as Ledger | undefined) ?? {}
      if (stale()) return read($, project)
      await update($, ledger, () => saved)
      // A step from another project must not keep spending here.
      await update($, current, () => null)
    }
    const chosen = ((await $.store.get(`active:${found.root}`)) as string | undefined) ?? null
    if (stale()) return read($, project)
    const name = pickActive(found.changes, chosen)
    await update($, active, () => name)
    let next: ChangeDetail | null = null
    if (name !== null) {
      const ran = await openspec($, ['status', '--change', name, '--json'])
      if (stale()) return read($, project)
      let status: ReturnType<typeof parseStatus>
      try {
        if (ran.exitCode !== 0) throw new Error('non-zero exit')
        status = parseStatus(ran.stdout)
      } catch {
        throw new Error(`openspec status failed: ${(ran.stderr || ran.stdout).split('\n')[0]}`)
      }
      const tasks = status.tasksPath ? await $.fs.read(status.tasksPath) : ''
      if (stale()) return read($, project)
      const commands = await installedCommands($, found.root)
      if (stale()) return read($, project)
      next = { name, artifacts: status.artifacts, nextTask: firstUnchecked(String(tasks)), commands }
    }
    await update($, detail, () => next)
    await update($, error, () => null)
    return found
  } catch (err) {
    if (stale()) return read($, project)
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
  // The store is shared by every session in this project: add to what it holds now, not to our copy.
  const stored = ((await $.store.get(`ledger:${p.root}`)) as Ledger | undefined) ?? {}
  const next = addSpend(stored, cur, add)
  await $.store.set(`ledger:${p.root}`, next)
  await update($, ledger, () => next)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'opsx-change', description: 'Show the OpenSpec pane, or switch the active change' })
    void refresh($)
      .then(p => p && $.ui.open({ id: PANE, title: TITLE }))
      .catch(() => {})
    poll?.cancel()
    // Poll while the pane is placed and a project is known or the last refresh failed; a repo with no OpenSpec stays quiet.
    poll = $.clock.every(POLL_MS, () => {
      void (async () => {
        const placed = (await $.ui.panes()).some(pane => pane.id === PANE && pane.isPlaced)
        if (placed && ((await read($, project)) || (await read($, error)) !== null)) await refresh($)
      })().catch(() => {})
    })
    return next(e)
  })

  on('command.run', { command: 'opsx-change' }, async ($, e) => {
    const p = await refresh($)
    if (!p) {
      const problem = await read($, error)
      if (problem === null) return { text: 'No OpenSpec project here' }
      await $.ui.open({ id: PANE, title: TITLE, focus: true })
      return { text: problem }
    }
    const name = e.args.trim()
    if (name && !(await choose($, name))) return { text: `No change named ${name}` }
    if (!name) await update($, showOthers, () => true)
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
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
    // /clear and a resume end the session without a session.start after: keep polling for those.
    if (e.reason !== 'clear' && e.reason !== 'resume') {
      poll?.cancel()
      poll = null
    }
    lastUsd = null
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const path = (e as { file_path?: unknown }).file_path
    if (WRITING_TOOLS.includes(e.tool) && typeof path === 'string' && /(^|\/)openspec\//.test(path)) refresh($).catch(() => {})
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
    const filled = change && change.totalTasks > 0 ? Math.min(width, Math.max(0, Math.round((change.completedTasks / change.totalTasks) * width))) : 0
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
                  <Text key={`spend-${step}`} color={cur?.change === d.name && cur.step === step ? 'claude' : undefined}>
                    {row(cur?.change === d.name && cur.step === step ? `${step} ▸` : step, s)}
                  </Text>
                ))}
                <Text bold>{row('Total', total)}</Text>
              </Box>
            )}

            <Box flexDirection="row" gap={1} marginTop={1}>
              {availableSteps(nextSteps(change, d.artifacts), d.commands).map(step => (
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

import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

import { LIST, LIST_NO_ROOT, STATUS_FULL, TASKS_MD } from './fixtures'

const PANE = {
  plugin: 'openspec-pane',
  component: 'Pane',
  requestId: 'openspec-pane',
  props: { title: 'OpenSpec', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const command = (cmd: string, args = '') =>
  ({ command: cmd, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } }) as never

const turn = (tokens: number) =>
  ({
    turnId: `t${tokens}`, reason: 'answer', answer: '', durationMs: 1, isAborted: false,
    usage: { input_tokens: tokens, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' },
  }) as never

const measure = (usd: number) =>
  ({ context: { window: 1_000_000 }, rateLimits: [], cost: { usd }, changed: ['cost'] }) as never

const ok = (stdout: string, exitCode = 0) =>
  ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }) as never

type Host = { list?: string | 'missing' | 'timeout' | 'broken'; listExit?: number; status?: string; statusExit?: number }

// The engine's side: a fake openspec CLI, file system, store and prompt box.
const stand = (on: On, host: Host = {}) => {
  const filled: string[] = []
  const opened: string[] = []
  const focused: string[] = []
  const store = new Map<string, unknown>()
  on('store.get', (_$, e) => ({ value: store.get(e.key) }) as never)
  on('store.set', (_$, e) => (store.set(e.key, e.value), { value: undefined }) as never)
  on('process.run', (_$, e) => {
    if (e.argv[0] !== 'openspec') return ok('')
    // Read per call so a test can change the CLI's output mid-test.
    const list = host.list ?? LIST
    if (list === 'missing') return { deny: 'spawn openspec ENOENT' } as never
    if (list === 'timeout') return { deny: 'command timed out after 5000ms' } as never
    if (list === 'broken') return { deny: 'EACCES: permission denied' } as never
    if (e.argv[1] === 'list') return ok(list, host.listExit ?? 0)
    if (e.argv[1] === 'status') return ok(host.status ?? STATUS_FULL, host.statusExit ?? 0)
    return ok('')
  })
  on('fs.read', () => ({ value: TASKS_MD }) as never)
  on('prompt.fill', (_$, e) => (filled.push(e.text), { isFilled: true }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('command.run', () => ({ text: '' }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('session.measure', () => ({ changed: ['cost'] }) as never)
  on('tool.call', () => ({ result: 'ok', text: 'ok' }) as never)
  on('session.start', () => ({ cwd: '/home/dev/shop-web' }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.end', () => ({ sessionId: 's1' }) as never)
  on('ui.open', (_$, e) => (opened.push(e.id), e.focus && focused.push(e.id), { value: { isPlaced: true } }) as never)
  return { filled, opened, focused, store }
}

test('/opsx-change brings the OpenSpec tab to the front', async ($, on) => {
  const { focused } = stand(on)
  await $.command.run(command('opsx-change'))
  await $.command.run(command('opsx-change', 'refactor-header-nav'))
  expect(focused).toEqual(['openspec-pane', 'openspec-pane'])
})

const open = async ($: Engine, surface: 'terminal' | 'desktop') => {
  await $.command.run(command('opsx-change'))
  return $.ui.mount({ ...PANE, surface } as never)
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: shows the active change, artifacts, tasks and next task`, async ($, on) => {
    stand(on)
    const ui = await open($, surface)
    expect(await ui.find({ type: 'Text', text: 'add-dark-mode-toggle' })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /6\/14 tasks/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: 'Next: 2.3 Persist theme choice' })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /● proposal/ })).toBeTruthy()
  })

  test(`${surface}: the Apply button fills the prompt`, async ($, on) => {
    const { filled } = stand(on)
    const ui = await open($, surface)
    await ui.press({ key: 'step-apply' })
    expect(filled).toEqual(['/opsx:apply add-dark-mode-toggle'])
  })

  test(`${surface}: spend sticks to the last /opsx step and stops at session end`, async ($, on) => {
    stand(on)
    const ui = await open($, surface)
    await $.session.measure(measure(1.0)) // baseline, never attributed
    await $.prompt.submit({ text: '/opsx:propose add-dark-mode-toggle' } as never)
    await $.turn.complete(turn(1000))
    await $.session.measure(measure(1.25))
    await $.prompt.submit({ text: 'tighten the wording' } as never)
    await $.turn.complete(turn(500))
    await $.prompt.submit({ text: '/opsx:apply' } as never)
    await $.turn.complete(turn(2000))
    await $.session.measure(measure(2.0))
    await $.session.end({ reason: 'clear' } as never)
    await $.turn.complete(turn(99999))

    expect(await ui.find({ type: 'Text', text: /propose\s+2k tok\s+\$0\.25/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /apply\s+2k tok\s+\$0\.75/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /Total\s+4k tok\s+\$1\.00/ })).toBeTruthy()
  })

  test(`${surface}: /opsx:apply as a slash command is recorded too`, async ($, on) => {
    stand(on)
    const ui = await open($, surface)
    await $.command.run(command('opsx:apply', 'add-dark-mode-toggle'))
    await $.turn.complete(turn(3000))
    expect(await ui.find({ type: 'Text', text: /apply ▸\s+3k tok/ })).toBeTruthy()
  })
}

test('a change name that does not exist does not become active', async ($, on) => {
  stand(on)
  const ui = await open($, 'terminal')
  await $.prompt.submit({ text: '/opsx:apply no-such-change' } as never)
  expect(await ui.find({ type: 'Text', text: 'add-dark-mode-toggle' })).toBeTruthy()
})

test('/opsx-change switches the active change', async ($, on) => {
  stand(on)
  const ui = await open($, 'terminal')
  await $.command.run(command('opsx-change', 'refactor-header-nav'))
  expect(await ui.find({ type: 'Text', text: 'refactor-header-nav' })).toBeTruthy()
})

test('missing CLI: /opsx-change opens the pane and replies with the install hint', async ($, on) => {
  const { opened } = stand(on, { list: 'missing' })
  const reply = await $.command.run(command('opsx-change'))
  expect((reply as { text: string }).text).toBe('openspec CLI not found — npm i -g @fission-ai/openspec')
  expect(opened).toContain('openspec-pane')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)
  expect(await ui.find({ type: 'Text', text: 'openspec CLI not found — npm i -g @fission-ai/openspec' })).toBeTruthy()
})

test('a timed-out CLI is reported as a timeout, not as missing', async ($, on) => {
  stand(on, { list: 'timeout' })
  const reply = await $.command.run(command('opsx-change'))
  expect((reply as { text: string }).text).toBe('openspec timed out')
})

test('another CLI failure shows its message', async ($, on) => {
  stand(on, { list: 'broken' })
  const reply = await $.command.run(command('opsx-change'))
  expect((reply as { text: string }).text).toMatch(/^openspec failed: .*EACCES: permission denied/)
})

test('spend merges with what another session stored for the project', async ($, on) => {
  const { store } = stand(on)
  const ui = await open($, 'terminal')
  await $.prompt.submit({ text: '/opsx:apply' } as never)
  store.set('ledger:/home/dev/shop-web', { 'add-dark-mode-toggle': { propose: { tokens: 5000, usd: 0.5 } } })
  await $.turn.complete(turn(2000))
  expect(await ui.find({ type: 'Text', text: /propose\s+5k tok\s+\$0\.50/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /apply ▸\s+2k tok/ })).toBeTruthy()
})

test('polling continues after /clear', async ($, on) => {
  const host: Host = {}
  const clock = mock.clock(on)
  stand(on, host)
  on('ui.panes', () => ({ value: [{ id: 'openspec-pane', title: 'OpenSpec', isShown: true, isFocused: false, isPlaced: true }] }) as never)
  await $.session.start({ cwd: '/home/dev/shop-web', surface: 'terminal', isInteractive: true } as never)
  const ui = await open($, 'terminal')
  await $.session.end({ reason: 'clear' } as never)
  host.list = LIST.replace('"completedTasks":6', '"completedTasks":9')
  await clock.advance(10_000)
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /9\/14 tasks/ })).toBeTruthy()
})

test('a Read of an openspec file does not refresh', async ($, on) => {
  const host: Host = {}
  const clock = mock.clock(on)
  stand(on, host)
  const ui = await open($, 'terminal')
  host.list = LIST.replace('"completedTasks":6', '"completedTasks":9')
  await $.tool.call({ tool: 'Read', file_path: 'openspec/changes/add-dark-mode-toggle/tasks.md' } as never)
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /6\/14 tasks/ })).toBeTruthy()
})
test('non-JSON output shows the error and keeps the last good data', async ($, on) => {
  const host: Host = {}
  stand(on, host)
  const ui = await open($, 'terminal')
  host.list = 'Segmentation fault'
  await $.turn.complete(turn(1))
  expect(await ui.find({ type: 'Text', text: /openspec list failed/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'add-dark-mode-toggle' })).toBeTruthy()
})

test('no OpenSpec root: /opsx-change says so', async ($, on) => {
  stand(on, { list: LIST_NO_ROOT, listExit: 1 })
  const reply = await $.command.run(command('opsx-change'))
  expect((reply as { text: string }).text).toBe('No OpenSpec project here')
})

test('a failing openspec status shows the error', async ($, on) => {
  stand(on, { status: 'boom', statusExit: 1 })
  const ui = await open($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /openspec status failed/ })).toBeTruthy()
})

test('garbage status output shows the error', async ($, on) => {
  stand(on, { status: 'not json' })
  const ui = await open($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /openspec status failed/ })).toBeTruthy()
})

test('a tool call on a relative openspec path refreshes the pane', async ($, on) => {
  const host: Host = {}
  const clock = mock.clock(on)
  stand(on, host)
  const ui = await open($, 'terminal')
  host.list = LIST.replace('"completedTasks":6', '"completedTasks":9')
  await $.tool.call({ tool: 'Write', file_path: 'openspec/changes/add-dark-mode-toggle/tasks.md' } as never)
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /9\/14 tasks/ })).toBeTruthy()
})

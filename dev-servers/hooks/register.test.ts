import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { CWD, LSOF, PS } from './fixtures'

const PANE = {
  plugin: 'dev-servers',
  component: 'Pane',
  requestId: 'dev-servers',
  props: { title: 'Dev servers', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const COMMAND = {
  command: 'dev-servers', args: '',
  origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 },
} as never

// The engine's side: a fake host whose processes die on SIGTERM.
// Panes opened with focus (brought to the front), per test.
let focused: string[] = []

const stand = (on: On, { listening = LSOF } = {}) => {
  focused = []
  const ran: string[] = []
  const dead = new Set<string>()
  on('process.run', (_$, e) => ({ value: answer(e.argv) }) as never)
  const answer = (argv: readonly string[]) => {
    const e = { argv }
    const cmd = e.argv.join(' ')
    ran.push(cmd)
    const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
    if (cmd.startsWith('lsof -nP')) return listening ? ok(listening) : { ...ok(), exitCode: 1 }
    if (cmd.startsWith('ps ')) return ok(PS)
    if (cmd.startsWith('lsof -a')) return ok(CWD)
    if (e.argv[0] === 'kill' && e.argv.length === 2) dead.add(e.argv[1]!)
    if (cmd.startsWith('kill -0')) return { ...ok(), exitCode: dead.has(e.argv[2]!) ? 1 : 0 }
    return ok()
  }
  on('ui.open', (_$, e) => (e.focus && focused.push(e.id), { value: { isPlaced: true } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('clock.sleep', () => ({ value: undefined }) as never)
  return ran
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: lists dev servers with project, port, tool and uptime`, async ($, on) => {
    stand(on)
    await $.command.run(COMMAND)
    const ui = await $.ui.mount({ ...PANE, surface } as never)

    expect(await ui.find({ type: 'Text', text: 'shop-web' })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: ':4321' })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: 'astro dev · up 2h 5m' })).toBeTruthy()
    const links = await ui.findAll({ type: 'Link', text: 'Open' })
    expect(links.map(l => l.props.href)).toEqual(['http://localhost:4321', 'http://localhost:8000'])
    // System services and ephemeral ports stay out.
    expect(await ui.findAll({ type: 'Text', text: /ControlCenter|5000|7000|57035/ })).toHaveLength(0)
  })

  test(`${surface}: Kill sends SIGTERM to that process only`, async ($, on) => {
    const ran = stand(on)
    await $.command.run(COMMAND)
    const ui = await $.ui.mount({ ...PANE, surface } as never)
    await ui.press({ key: 'kill-4321' })

    expect(ran).toContain('kill 4321')
    expect(ran).not.toContain('kill -9 4321')
    expect(ran.filter(c => c.startsWith('kill 8000'))).toHaveLength(0)
  })

  test(`${surface}: Restart stops it, then relaunches the same command in its directory`, async ($, on) => {
    const ran = stand(on)
    await $.command.run(COMMAND)
    const ui = await $.ui.mount({ ...PANE, surface } as never)
    await ui.press({ key: 'restart-4321' })

    const relaunch = ran.find(c => c.startsWith('sh -c'))
    expect(ran.indexOf('kill 4321')).toBeLessThan(ran.indexOf(relaunch!))
    expect(relaunch).toContain('/home/dev/shop-web node /home/dev/shop-web/node_modules/.bin/astro dev 4321')
  })
}

test('shows an empty state when nothing listens', async ($, on) => {
  stand(on, { listening: '' })
  await $.command.run(COMMAND)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)
  expect(await ui.find({ type: 'Text', text: 'No dev servers running.' })).toBeTruthy()
})

test('/dev-servers brings its tab to the front', async ($, on) => {
  stand(on)
  await $.command.run(COMMAND)
  expect(focused).toEqual(['dev-servers'])
})

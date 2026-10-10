import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'context-meter',
  component: 'Pane',
  requestId: 'context-meter',
  props: { title: 'Context', isFocused: false, bodyColumns: 22, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const measure = (tokens: number | undefined, usd = 1.5) => ({
  context: { tokens, window: 1_000_000, percent: tokens === undefined ? undefined : Math.round(tokens / 10_000) },
  rateLimits: [],
  cost: { usd },
  changed: ['context' as const],
})

// The engine's side: answer measurements, commands and pane opens, and record toasts.
const stand = (on: On) => {
  const toasts: string[] = []
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('ui.toast', (_$, e) => (toasts.push(e.text), { value: undefined } as never))
  return toasts
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: pane shows percent, bar, status and cost; alerts past 200k`, async ($, on) => {
    const toasts = stand(on)

    await $.session.measure(measure(42_000))
    const ui = await $.ui.mount({ ...PANE, surface } as never)
    expect(await ui.find({ type: 'Text', text: '4%' })).toBeTruthy()
    // 42k of 1M across 20 cells fills 1.
    expect(await ui.find({ type: 'Text', text: /^█$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /^░{19}$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: 'Healthy' })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: '$1.50' })).toBeTruthy()
    expect(toasts).toHaveLength(0)

    await $.session.measure(measure(150_000))
    expect(await ui.find({ type: 'Text', text: 'Growing' })).toBeTruthy()

    await $.session.measure(measure(250_000))
    await $.session.measure(measure(260_000))
    expect(await ui.find({ type: 'Text', text: 'Compact now' })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /^█{6}$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: 'Run /compact or /clear' })).toBeTruthy()
    expect(toasts).toHaveLength(1)

    // Dropping below re-arms the toast.
    await $.session.measure(measure(30_000))
    await $.session.measure(measure(210_000))
    expect(toasts).toHaveLength(2)
  })
}

test('pane waits for the first response', async ($, on) => {
  stand(on)
  await $.session.measure(measure(undefined))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)
  expect(await ui.find({ type: 'Text', text: /Waiting/ })).toBeTruthy()
})

test('a turn over the threshold toasts once, and re-arms after a cheap turn', async ($, on) => {
  const toasts = stand(on)

  // First reading sets the baseline; there is no turn cost yet.
  await $.session.measure(measure(42_000, 1.5))
  expect(toasts).toHaveLength(0)

  await $.session.measure(measure(42_000, 2.1))
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatch(/\$0\.60/)

  // Still over on the next turn: no second toast.
  await $.session.measure(measure(42_000, 2.9))
  expect(toasts).toHaveLength(1)

  // A cheap turn re-arms the warning.
  await $.session.measure(measure(42_000, 3.0))
  await $.session.measure(measure(42_000, 3.8))
  expect(toasts).toHaveLength(2)
})

test('a cost reset does not warn, and the next turn is measured from the new total', async ($, on) => {
  const toasts = stand(on)

  await $.session.measure(measure(42_000, 4.0))
  await $.session.measure(measure(42_000, 0.2))
  expect(toasts).toHaveLength(0)

  await $.session.measure(measure(42_000, 0.8))
  expect(toasts).toHaveLength(1)
})

test('a reading without cost leaves the baseline alone', async ($, on) => {
  const toasts = stand(on)

  await $.session.measure(measure(42_000, 1.0))
  await $.session.measure({ ...measure(42_000), cost: undefined } as never)
  expect(toasts).toHaveLength(0)

  // The gap is counted as part of this turn: 2.0 - 1.0 = 1.0, over the threshold.
  await $.session.measure(measure(42_000, 2.0))
  expect(toasts).toHaveLength(1)
})

test('pane shows the last turn and the next-turn estimate once a turn has cost', async ($, on) => {
  stand(on)

  await $.session.measure(measure(42_000, 1.0))
  await $.session.measure(measure(42_000, 1.2))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)

  expect(await ui.find({ type: 'Text', text: 'Last turn' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: '$0.20' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'Next turn ≈' })).toBeTruthy()
  // No budget is set by default, so no budget row.
  expect(await ui.find({ type: 'Text', text: 'Budget' })).toBeFalsy()
})

test('pane shows no cost rows before a second cost reading', async ($, on) => {
  stand(on)

  await $.session.measure(measure(42_000, 1.0))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)

  expect(await ui.find({ type: 'Text', text: 'Last turn' })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: 'Next turn ≈' })).toBeFalsy()
})

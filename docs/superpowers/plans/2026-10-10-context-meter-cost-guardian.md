# context-meter Cost Guardian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-turn cost, a next-turn estimate, and an optional session budget to the context-meter pane, with warnings only.

**Architecture:** Pure cost arithmetic lives in a new `hooks/cost.ts` with no engine imports, so it is unit-tested directly. `hooks/register.tsx` stores the previous cumulative cost in plugin state, derives the turn cost on each `session.measure`, and raises one toast per crossing. The pane gets three extra rows under the existing "Session cost" row.

**Tech Stack:** TypeScript, React-style TSX for the pane, `claude-code` plugin API (`atom`, `read`, `update`, `on`), `claude-code/testing` (`test`, `expect`).

**Spec:** `docs/superpowers/specs/2026-10-10-context-meter-cost-guardian-design.md`

## Global Constraints

- Warning only. Nothing blocks, and no confirmation prompts.
- No model price table. Cost comes only from `e.cost.usd`.
- `TURN_WARN_USD = 0.5`, defined at the top of `context-meter/hooks/register.tsx`.
- `SESSION_BUDGET_USD = undefined`, defined next to it. Off by default.
- Toasts and warnings fire once per crossing. Per-turn re-arms after a cheap turn. The session budget does not re-arm within a session.
- Missing `e.cost` never writes the cost baseline and never produces a row or toast.

## Review Focus

1. **Cost missing on some turns:** the next turn's delta spans the gap. The turn value is the total since the last known reading, not a per-turn figure. Pinned in Task 2.
2. **Cost goes down (new session or `/clear`):** no negative turn cost, no warning. Pinned in Task 1.
3. **Session starts with cost already above the threshold:** no turn warning on the first reading, because there is no baseline yet. Pinned in Task 2.
4. **Budget set to 0:** any reading at or above 0 counts as over budget, so it warns on the first reading that has cost. Pinned in Task 1.
5. **Budget set but cost unknown:** no budget row, no crash. Pinned in Task 3.

---

### Task 1: Pure cost arithmetic

**Files:**
- Create: `context-meter/hooks/cost.ts`
- Test: `context-meter/hooks/cost.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `turnCost(lastUsd: number | undefined, usd: number): number | undefined`. Returns the increase since the last reading. Returns `undefined` when there is no baseline (`lastUsd` is `undefined`) or the total went down (reset).
  - `overBudget(usd: number, budget: number | undefined): boolean`. Returns `false` when `budget` is `undefined`, otherwise `usd >= budget`.

- [ ] **Step 1: Write the failing test**

Create `context-meter/hooks/cost.test.ts`:

```ts
import { expect, test } from 'claude-code/testing'
import { overBudget, turnCost } from './cost'

test('turn cost is the increase since the last reading', () => {
  expect(turnCost(1.5, 2.25)).toBe(0.75)
})

test('no baseline yet gives no turn cost', () => {
  expect(turnCost(undefined, 1.5)).toBeUndefined()
})

test('a lower total is a reset, not a negative turn', () => {
  expect(turnCost(3, 0.4)).toBeUndefined()
})

test('an unchanged total costs nothing', () => {
  expect(turnCost(1.5, 1.5)).toBe(0)
})

test('no budget is never over', () => {
  expect(overBudget(999, undefined)).toBe(false)
})

test('at or above the budget is over', () => {
  expect(overBudget(4.99, 5)).toBe(false)
  expect(overBudget(5, 5)).toBe(true)
})

test('a budget of 0 is over as soon as any cost is reported', () => {
  expect(overBudget(0, 0)).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `context-meter/`): `claude plugin test .`
Expected: FAIL, because `./cost` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `context-meter/hooks/cost.ts`:

```ts
// Pure cost arithmetic for the cost guardian. No engine imports, so it runs under plain tests.

// Increase since the last cumulative reading. Undefined when there is no baseline yet,
// or when the total went down (a new session, or a clear that resets cost).
export const turnCost = (lastUsd: number | undefined, usd: number): number | undefined => {
  if (lastUsd === undefined || usd < lastUsd) return undefined
  return usd - lastUsd
}

// No budget set means never over.
export const overBudget = (usd: number, budget: number | undefined): boolean =>
  budget !== undefined && usd >= budget
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `context-meter/`): `claude plugin test .`
Expected: PASS for all tests in `cost.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add context-meter/hooks/cost.ts context-meter/hooks/cost.test.ts
git commit -m "feat(context-meter): add pure turn-cost and budget helpers"
```

---

### Task 2: Warnings and cost state in the measure handler

**Files:**
- Modify: `context-meter/types/index.d.ts`
- Modify: `context-meter/hooks/register.tsx`
- Test: `context-meter/hooks/register.test.ts`

**Interfaces:**
- Consumes: `turnCost(lastUsd, usd)` and `overBudget(usd, budget)` from Task 1, imported from `./cost`.
- Produces:
  - `Reading` gains `turnUsd?: number`, which the pane reads in Task 3.
  - `PluginState['context-meter']` gains `lastUsd: number | undefined`, `turnWarned: boolean`, `budgetWarned: boolean`.
  - Constants `TURN_WARN_USD` and `SESSION_BUDGET_USD` at the top of `register.tsx`.

- [ ] **Step 1: Write the failing test**

Append to `context-meter/hooks/register.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `context-meter/`): `claude plugin test .`
Expected: FAIL. The new tests find no toasts, because the handler has no cost logic yet.

- [ ] **Step 3: Write minimal implementation**

In `context-meter/types/index.d.ts`, replace the file contents with:

```ts
export type Reading = { tokens: number; window: number; percent: number; usd?: number; turnUsd?: number }

declare module 'claude-code' {
  interface PluginState {
    'context-meter': {
      reading: Reading | null
      hasWarned: boolean
      lastUsd: number | undefined
      turnWarned: boolean
      budgetWarned: boolean
    }
  }
}
```

In `context-meter/hooks/register.tsx`:

1. Add the import below the existing `Reading` import:

```ts
import { overBudget, turnCost } from './cost'
```

2. Add the constants under `ALERT_TOKENS`:

```ts
// Warn when a single turn costs at least this much (USD). Warning only, never blocks.
const TURN_WARN_USD = 0.5
// Off by default. Set a number to warn once when the session total reaches it.
const SESSION_BUDGET_USD: number | undefined = undefined
```

3. Add the atoms under `hasWarned`:

```ts
const lastUsd = atom({ plugin: 'context-meter', key: 'lastUsd' } as const, undefined as number | undefined)
const turnWarned = atom({ plugin: 'context-meter', key: 'turnWarned' } as const, false)
const budgetWarned = atom({ plugin: 'context-meter', key: 'budgetWarned' } as const, false)
```

4. Replace the `session.measure` handler body with:

```ts
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
        $.ui.toast(`Session cost is $${usd.toFixed(2)}, over your $${SESSION_BUDGET_USD} budget`)
        await update($, budgetWarned, () => true)
      }
    }

    return next(e)
  })
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `context-meter/`): `claude plugin test .`
Expected: PASS for all tests, including the existing pane tests. Those keep `usd` at 1.5, so their turn cost is 0 and they produce no turn toasts.

- [ ] **Step 5: Commit**

```bash
git add context-meter/types/index.d.ts context-meter/hooks/register.tsx context-meter/hooks/register.test.ts
git commit -m "feat(context-meter): warn on expensive turns and an optional session budget"
```

---

### Task 3: Cost rows in the pane

**Files:**
- Modify: `context-meter/hooks/register.tsx`
- Test: `context-meter/hooks/register.test.ts`

**Interfaces:**
- Consumes: `Reading.turnUsd` and `Reading.usd` from Task 2, `TURN_WARN_USD` and `SESSION_BUDGET_USD` from Task 2.
- Produces: pane rows `Last turn`, `Next turn ≈`, and `Budget`, shown only when their values are known.

- [ ] **Step 1: Write the failing test**

Append to `context-meter/hooks/register.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `context-meter/`): `claude plugin test .`
Expected: FAIL on the first new test, because the pane has no `Last turn` row yet.

- [ ] **Step 3: Write minimal implementation**

In `context-meter/hooks/register.tsx`, in the `ui.render` handler, replace the existing cost line:

```tsx
          {r.usd !== undefined && row('Session cost', `$${r.usd.toFixed(2)}`)}
```

with:

```tsx
          {r.usd !== undefined && row('Session cost', `$${r.usd.toFixed(2)}`)}
          {r.turnUsd !== undefined && (
            <>
              {row('Last turn', `$${r.turnUsd.toFixed(2)}`, r.turnUsd >= TURN_WARN_USD ? 'warning' : undefined)}
              {row('Next turn ≈', `$${r.turnUsd.toFixed(2)}`)}
            </>
          )}
          {SESSION_BUDGET_USD !== undefined && r.usd !== undefined && row('Budget', `$${r.usd.toFixed(2)} of $${SESSION_BUDGET_USD.toFixed(2)}`)}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `context-meter/`): `claude plugin test .`
Expected: PASS for all tests.

- [ ] **Step 5: Commit**

```bash
git add context-meter/hooks/register.tsx context-meter/hooks/register.test.ts
git commit -m "feat(context-meter): show last-turn and next-turn cost in the pane"
```

---

### Task 4: Check the spec's assumptions in a real session

Automated tests cannot confirm how the harness reports cost, so check it by hand.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-10-context-meter-cost-guardian-design.md` (the Assumptions section)

- [ ] **Step 1: Start a session with the plugin loaded**

From the repo root, run: `claude --plugin-dir context-meter`

- [ ] **Step 2: Send three short prompts and watch the pane**

Confirm that `Session cost` grows across turns, and that `Last turn` equals the difference between consecutive `Session cost` values. This checks assumption 1 (cumulative cost).

- [ ] **Step 3: Run `/clear` and send one more prompt**

Note whether `Session cost` resets to a lower value or keeps growing. This checks assumption 2. Either result is handled by the reset rule.

- [ ] **Step 4: Check that cost appears on every turn**

Confirm `Session cost` is present on each turn. This checks assumption 3.

- [ ] **Step 5: Record the results in the spec**

Replace the "Assumptions to verify before planning" heading with "Assumptions, verified" and write the observed result for each of the three assumptions under it. Then commit:

```bash
git add docs/superpowers/specs/2026-10-10-context-meter-cost-guardian-design.md
git commit -m "docs: record cost guardian assumptions checked in a live session"
```

---

## Self-Review

**Spec coverage:**
- Per-turn cost and next-turn estimate: Task 2 (state and toast), Task 3 (rows).
- Warn-only per-turn threshold with re-arm: Task 2, tested in the first new Task 2 test.
- Optional session budget, off by default, no re-arm: Task 1 (`overBudget`), Task 2 (toast and `budgetWarned`), Task 3 (row).
- Reset handling and missing cost: Task 1 (`turnCost`), Task 2 (tests for reset and missing cost).
- State fields: Task 2 (`lastUsd`, `turnWarned`, `budgetWarned`).
- Assumptions: Task 4.

**Deviation from the spec:** the spec lists three state fields. This plan also adds `Reading.turnUsd`, because the pane needs the last turn's value and `Reading` is the only state the pane reads.

**Placeholder scan:** none. Every code step has the code it needs.

**Type consistency:** `turnCost` and `overBudget` are defined in Task 1 and used with the same signatures in Task 2. `lastUsd`, `turnWarned`, and `budgetWarned` are declared in `types/index.d.ts` in Task 2 and match their atom keys. `Reading.turnUsd` is declared in Task 2 and read in Task 3.

**Review Focus:** each of the five items has a test in its owning task, as noted in the list above.

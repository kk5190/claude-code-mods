# OpenSpec Pane (Stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Claude Code mod, `openspec-pane`, showing the active OpenSpec change, its artifact and task progress, token/dollar spend per OPSX step, and next-step buttons that fill the prompt.

**Architecture:** Two pure modules hold all logic: `openspec.ts` (parse `openspec` CLI JSON, pick the active change, choose next steps, find the next task) and `spend.ts` (parse `/opsx:` prompts, add usage to a ledger). `register.tsx` wires Claude Code events to them, keeps values in `$.state`, persists the ledger and chosen change in `$.store`, and draws the pane.

**Tech Stack:** Claude Code hooks API (`claude-code`, `claude-code/testing`), TypeScript/TSX, `openspec` CLI ≥ 1.9 JSON output. Commands: `claude plugin validate`, `claude plugin test`, `tsc`.

**Spec:** `docs/specs/2026-10-10-openspec-pane-design.md`

## Global Constraints

- Mod folder: `~/.claude/mods/openspec-pane/`; plugin name `openspec-pane`; state namespace `'openspec-pane'`.
- Read OpenSpec state only via `openspec list --json` and `openspec status --change <name> --json`; read `tasks.md` only at the path `status` reports.
- No-root signal: `openspec list --json` prints `"root": null` and exits 1. Treat that as "no project", not an error.
- Missing CLI message, verbatim: `openspec CLI not found — npm i -g @fission-ai/openspec`
- No-root reply to `/opsx-change`, verbatim: `No OpenSpec project here`
- Empty state, verbatim: `No change in progress`
- Buttons fill the prompt (`$.prompt.fill({ text, mode: 'replace' })`), never submit.
- Spend is sticky: current step lasts until the next `/opsx:` prompt, `/clear`, or session end.
- Fixtures, tests, README and examples use made-up data only (`/home/dev/shop-web`, `add-dark-mode-toggle`, …). Nothing from real projects.
- Commits: no Claude attribution lines. Before every push, `git grep` the mods repo for real project names.

## Review Focus

1. **`/opsx:apply` arriving as a slash command rather than prompt text** — the step must still be recorded. Pinned by a `command.run` test in Task 3.
2. **`/opsx:apply some-change` naming a change that does not exist** — active change must not switch to a ghost; step still recorded against the current active change. Pinned in Task 1 (`pickActive`) and Task 3.
3. **Mod reload mid-session** — the first `session.measure` after a reload must not attribute the whole session's cost to the current step. Pinned in Task 3.
4. **`tasks.md` with no unchecked lines, or a change without a tasks artifact** — "Next:" line omitted, no crash. Pinned in Task 1.
5. **CLI emits non-JSON (crash, warning banner)** — pane shows the error and keeps the last good data. Pinned in Task 3.

---

### Task 1: Scaffold and the `openspec.ts` module

**Files:**
- Create: `openspec-pane/.claude-plugin/plugin.json`
- Create: `openspec-pane/hooks/hooks.json`
- Create: `openspec-pane/types/index.d.ts`
- Create: `openspec-pane/hooks/fixtures.ts`
- Create: `openspec-pane/hooks/openspec.ts`
- Test: `openspec-pane/hooks/openspec.test.ts`

**Interfaces:**
- Produces (`types/index.d.ts`): `ChangeSummary`, `Artifact`, `Project`, `ChangeDetail`, `Step`, `StepSpend`, `Ledger`, `Current`, and the `PluginState['openspec-pane']` contract below.
- Produces (`openspec.ts`):
  - `parseList(stdout: string): Project | null` — throws `SyntaxError` on invalid JSON.
  - `parseStatus(stdout: string): { artifacts: Artifact[]; tasksPath: string | null }`
  - `firstUnchecked(markdown: string): string | null`
  - `pickActive(changes: ChangeSummary[], chosen: string | null): string | null`
  - `nextSteps(change: ChangeSummary, artifacts: Artifact[]): Step[]`
- Produces (`fixtures.ts`): `LIST`, `LIST_NO_ROOT`, `STATUS_FULL`, `STATUS_NO_TASKS`, `TASKS_MD`, `ROOT`.

- [ ] **Step 1: Create the manifest, hooks file and state contract**

`openspec-pane/.claude-plugin/plugin.json`:
```json
{
  "name": "openspec-pane",
  "version": "0.1.0",
  "description": "Side pane for OpenSpec: active change, artifact and task progress, spend per OPSX step, next-step buttons",
  "author": { "name": "kk5190" },
  "license": "MIT",
  "homepage": "https://github.com/kk5190/claude-code-mods/tree/main/openspec-pane",
  "repository": "https://github.com/kk5190/claude-code-mods",
  "types": "./types/index.d.ts"
}
```

`openspec-pane/hooks/hooks.json`:
```json
{ "modules": ["./register.tsx"] }
```

`openspec-pane/types/index.d.ts`:
```ts
export type ChangeSummary = {
  name: string
  completedTasks: number
  totalTasks: number
  lastModified: string
  status: string
}

export type Project = { root: string; changes: ChangeSummary[] }

export type Artifact = { id: string; present: boolean }

export type ChangeDetail = { name: string; artifacts: Artifact[]; nextTask: string | null }

export type Step = 'continue' | 'apply' | 'verify' | 'archive'

export type StepSpend = { tokens: number; usd: number }

/** change name → OPSX step → spend */
export type Ledger = Record<string, Record<string, StepSpend>>

export type Current = { change: string; step: string } | null

declare module 'claude-code' {
  interface PluginState {
    'openspec-pane': {
      project: Project | null
      detail: ChangeDetail | null
      active: string | null
      current: Current
      ledger: Ledger
      error: string | null
      showOthers: boolean
    }
  }
}
```

- [ ] **Step 2: Write the made-up fixtures**

`openspec-pane/hooks/fixtures.ts`:
```ts
// Made-up OpenSpec CLI output, shaped like openspec 1.9's JSON. Not from any real project.
export const ROOT = '/home/dev/shop-web'

export const LIST = JSON.stringify({
  changes: [
    { name: 'fix-cart-badge', completedTasks: 14, totalTasks: 14, lastModified: '2026-09-20T10:00:00.000Z', status: 'complete' },
    { name: 'add-dark-mode-toggle', completedTasks: 6, totalTasks: 14, lastModified: '2026-09-18T10:00:00.000Z', status: 'in-progress' },
    { name: 'refactor-header-nav', completedTasks: 0, totalTasks: 9, lastModified: '2026-09-01T10:00:00.000Z', status: 'in-progress' },
  ],
  root: { path: ROOT, source: 'nearest' },
})

export const LIST_NO_ROOT = JSON.stringify({
  changes: [],
  root: null,
  status: [{ severity: 'error', code: 'no_openspec_root', message: 'No OpenSpec root found from the current directory.' }],
})

const artifact = (rel: string, present: boolean) => ({
  outputPath: rel,
  resolvedOutputPath: `${ROOT}/openspec/changes/add-dark-mode-toggle/${rel}`,
  existingOutputPaths: present ? [`${ROOT}/openspec/changes/add-dark-mode-toggle/${rel}`] : [],
})

export const STATUS_FULL = JSON.stringify({
  changeName: 'add-dark-mode-toggle',
  schemaName: 'spec-driven',
  artifactPaths: {
    proposal: artifact('proposal.md', true),
    specs: artifact('specs/**/*.md', true),
    design: artifact('design.md', true),
    tasks: artifact('tasks.md', true),
  },
})

export const STATUS_NO_TASKS = JSON.stringify({
  changeName: 'refactor-header-nav',
  schemaName: 'spec-driven',
  artifactPaths: {
    proposal: artifact('proposal.md', true),
    specs: artifact('specs/**/*.md', false),
    design: artifact('design.md', false),
    tasks: artifact('tasks.md', false),
  },
})

export const TASKS_MD = [
  '# Tasks',
  '',
  '## 1. Theme tokens',
  '- [x] 1.1 Add light and dark token sets',
  '- [x] 1.2 Expose tokens as CSS variables',
  '',
  '## 2. Toggle',
  '- [x] 2.1 Add the toggle component',
  '- [x] 2.2 Wire it into the header',
  '- [ ] 2.3 Persist theme choice',
  '- [ ] 2.4 Respect prefers-color-scheme on first visit',
].join('\n')
```

- [ ] **Step 3: Write the failing tests**

`openspec-pane/hooks/openspec.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'

import { LIST, LIST_NO_ROOT, ROOT, STATUS_FULL, STATUS_NO_TASKS, TASKS_MD } from './fixtures'
import { firstUnchecked, nextSteps, parseList, parseStatus, pickActive } from './openspec'

const change = (over: Partial<{ completedTasks: number; totalTasks: number }>) => ({
  name: 'add-dark-mode-toggle', completedTasks: 6, totalTasks: 14, lastModified: '', status: 'in-progress', ...over,
})
const all = (present: boolean) => ['proposal', 'specs', 'design', 'tasks'].map(id => ({ id, present }))

describe('openspec', () => {
  test('parseList reads root and changes', () => {
    const project = parseList(LIST)
    expect(project?.root).toBe(ROOT)
    expect(project?.changes.map(c => c.name)).toEqual(['fix-cart-badge', 'add-dark-mode-toggle', 'refactor-header-nav'])
  })

  test('parseList returns null when there is no OpenSpec root', () => {
    expect(parseList(LIST_NO_ROOT)).toBe(null)
  })

  test('parseList throws on output that is not JSON', () => {
    expect(() => parseList('Warning: something odd\n{')).toThrow()
  })

  test('parseStatus lists artifacts in schema order with presence and the tasks path', () => {
    expect(parseStatus(STATUS_FULL)).toEqual({
      artifacts: all(true),
      tasksPath: `${ROOT}/openspec/changes/add-dark-mode-toggle/tasks.md`,
    })
    const partial = parseStatus(STATUS_NO_TASKS)
    expect(partial.artifacts.map(a => a.present)).toEqual([true, false, false, false])
    expect(partial.tasksPath).toBe(null)
  })

  test('firstUnchecked returns the first open task, or null', () => {
    expect(firstUnchecked(TASKS_MD)).toBe('2.3 Persist theme choice')
    expect(firstUnchecked('- [x] 1.1 Done')).toBe(null)
    expect(firstUnchecked('')).toBe(null)
  })

  test('pickActive prefers an existing chosen change, else the newest in-progress one', () => {
    const changes = parseList(LIST)!.changes
    expect(pickActive(changes, 'refactor-header-nav')).toBe('refactor-header-nav')
    expect(pickActive(changes, 'no-such-change')).toBe('add-dark-mode-toggle')
    expect(pickActive(changes, null)).toBe('add-dark-mode-toggle')
    expect(pickActive(changes.filter(c => c.status === 'complete'), null)).toBe(null)
  })

  test('nextSteps follows the change state', () => {
    expect(nextSteps(change({}), [{ id: 'proposal', present: true }, { id: 'tasks', present: false }])).toEqual(['continue'])
    expect(nextSteps(change({}), all(true))).toEqual(['apply'])
    expect(nextSteps(change({ completedTasks: 14 }), all(true))).toEqual(['verify', 'archive'])
    expect(nextSteps(change({ completedTasks: 0, totalTasks: 0 }), all(true))).toEqual(['verify', 'archive'])
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `claude plugin test ~/.claude/mods/openspec-pane`
Expected: FAIL — `./openspec` cannot be resolved.

- [ ] **Step 5: Implement `openspec.ts`**

`openspec-pane/hooks/openspec.ts`:
```ts
import type { Artifact, ChangeSummary, Project, Step } from '../types'

type ListJson = { root: { path: string } | null; changes: ChangeSummary[] }
type StatusJson = { artifactPaths?: Record<string, { existingOutputPaths?: string[] }> }

/** `openspec list --json` → the project, or null when no OpenSpec root was found. */
export const parseList = (stdout: string): Project | null => {
  const json = JSON.parse(stdout) as ListJson
  return json.root ? { root: json.root.path, changes: json.changes } : null
}

/** `openspec status --change <name> --json` → artifacts in schema order, and the tasks file if it exists. */
export const parseStatus = (stdout: string): { artifacts: Artifact[]; tasksPath: string | null } => {
  const paths = (JSON.parse(stdout) as StatusJson).artifactPaths ?? {}
  const artifacts = Object.entries(paths).map(([id, p]) => ({ id, present: (p.existingOutputPaths?.length ?? 0) > 0 }))
  return { artifacts, tasksPath: paths.tasks?.existingOutputPaths?.[0] ?? null }
}

/** The text of the first `- [ ]` line in a tasks file. */
export const firstUnchecked = (markdown: string): string | null =>
  markdown.match(/^\s*-\s\[ \]\s+(.+?)\s*$/m)?.[1] ?? null

/** The chosen change when it still exists, else the most recently modified change still in progress. */
export const pickActive = (changes: ChangeSummary[], chosen: string | null): string | null => {
  if (chosen && changes.some(c => c.name === chosen)) return chosen
  const open = changes.filter(c => c.status !== 'complete')
  open.sort((a, b) => b.lastModified.localeCompare(a.lastModified))
  return open[0]?.name ?? null
}

/** Which OPSX steps make sense next for a change. */
export const nextSteps = (change: ChangeSummary, artifacts: Artifact[]): Step[] => {
  if (artifacts.some(a => !a.present)) return ['continue']
  if (change.completedTasks < change.totalTasks) return ['apply']
  return ['verify', 'archive']
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `claude plugin test ~/.claude/mods/openspec-pane`
Expected: 7 pass, 0 fail. (`claude plugin validate` will fail until Task 3 adds `register.tsx`; that is expected.)

- [ ] **Step 7: Commit**

```bash
cd ~/.claude/mods && git add openspec-pane && git commit -m "openspec-pane: parse openspec CLI output and pick the active change"
```

---

### Task 2: The `spend.ts` module

**Files:**
- Create: `openspec-pane/hooks/spend.ts`
- Test: `openspec-pane/hooks/spend.test.ts`

**Interfaces:**
- Consumes: `Ledger`, `Current`, `StepSpend` from `types/index.d.ts` (Task 1).
- Produces:
  - `parseOpsx(text: string): { step: string; change: string | null } | null`
  - `usageTokens(usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }): number`
  - `addSpend(ledger: Ledger, current: Current, add: Partial<StepSpend>): Ledger` — returns the same object when `current` is null.
  - `changeTotal(steps: Record<string, StepSpend> | undefined): StepSpend`

- [ ] **Step 1: Write the failing tests**

`openspec-pane/hooks/spend.test.ts`:
```ts
import { describe, expect, test } from 'claude-code/testing'

import { addSpend, changeTotal, parseOpsx, usageTokens } from './spend'

describe('spend', () => {
  test('parseOpsx reads the step and optional change name', () => {
    expect(parseOpsx('/opsx:apply add-dark-mode-toggle')).toEqual({ step: 'apply', change: 'add-dark-mode-toggle' })
    expect(parseOpsx('/opsx:verify')).toEqual({ step: 'verify', change: null })
    expect(parseOpsx('  /opsx:bulk-archive  ')).toEqual({ step: 'bulk-archive', change: null })
    expect(parseOpsx('please run /opsx:apply')).toBe(null)
    expect(parseOpsx('/opsx-change foo')).toBe(null)
  })

  test('usageTokens sums every token kind', () => {
    expect(usageTokens({ input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 300, cache_creation_input_tokens: 40 })).toBe(370)
  })

  test('addSpend accumulates per change and step without mutating', () => {
    const empty = {}
    const one = addSpend(empty, { change: 'a', step: 'apply' }, { tokens: 100 })
    const two = addSpend(one, { change: 'a', step: 'apply' }, { usd: 0.5 })
    const three = addSpend(two, { change: 'a', step: 'verify' }, { tokens: 7, usd: 0.1 })
    expect(empty).toEqual({})
    expect(three).toEqual({ a: { apply: { tokens: 100, usd: 0.5 }, verify: { tokens: 7, usd: 0.1 } } })
  })

  test('addSpend ignores spend with no current step', () => {
    const ledger = { a: { apply: { tokens: 1, usd: 1 } } }
    expect(addSpend(ledger, null, { tokens: 999 })).toBe(ledger)
  })

  test('changeTotal sums a change across steps', () => {
    expect(changeTotal({ apply: { tokens: 100, usd: 0.5 }, verify: { tokens: 7, usd: 0.1 } })).toEqual({ tokens: 107, usd: 0.6 })
    expect(changeTotal(undefined)).toEqual({ tokens: 0, usd: 0 })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `claude plugin test ~/.claude/mods/openspec-pane`
Expected: FAIL — `./spend` cannot be resolved.

- [ ] **Step 3: Implement `spend.ts`**

`openspec-pane/hooks/spend.ts`:
```ts
import type { Current, Ledger, StepSpend } from '../types'

/** `/opsx:<step> [change]` at the start of a prompt → its step and change. */
export const parseOpsx = (text: string): { step: string; change: string | null } | null => {
  const m = text.trim().match(/^\/opsx:([a-z][a-z-]*)(?:\s+(\S+))?/)
  return m ? { step: m[1]!, change: m[2] ?? null } : null
}

export const usageTokens = (u: {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}) => u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens

/** Adds spend to the current change and step; spend with no current step is not attributed. */
export const addSpend = (ledger: Ledger, current: Current, add: Partial<StepSpend>): Ledger => {
  if (current === null) return ledger
  const steps = ledger[current.change] ?? {}
  const was = steps[current.step] ?? { tokens: 0, usd: 0 }
  const now = { tokens: was.tokens + (add.tokens ?? 0), usd: was.usd + (add.usd ?? 0) }
  return { ...ledger, [current.change]: { ...steps, [current.step]: now } }
}

export const changeTotal = (steps: Record<string, StepSpend> | undefined): StepSpend =>
  Object.values(steps ?? {}).reduce((t, s) => ({ tokens: t.tokens + s.tokens, usd: t.usd + s.usd }), { tokens: 0, usd: 0 })
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `claude plugin test ~/.claude/mods/openspec-pane`
Expected: 12 pass, 0 fail. If `changeTotal` fails on `0.6` vs `0.6000000000000001`, change that assertion to `expect(t.usd).toBeCloseTo(0.6)` with `t.tokens` checked separately.

- [ ] **Step 5: Commit**

```bash
cd ~/.claude/mods && git add openspec-pane/hooks/spend.ts openspec-pane/hooks/spend.test.ts && git commit -m "openspec-pane: attribute spend to OPSX steps"
```

---

### Task 3: Events, refresh, pane and buttons (`register.tsx`)

**Files:**
- Create: `openspec-pane/hooks/register.tsx`
- Test: `openspec-pane/hooks/register.test.ts`

**Interfaces:**
- Consumes: everything Task 1 and Task 2 produce.
- Produces: the loaded mod — pane id `openspec-pane`, command `/opsx-change [change]`, buttons keyed `step-<step>`, others list keyed `others` (toggle) and `pick-<change>`.
- `$.store` keys: `ledger:<root>` → `Ledger`; `active:<root>` → `string`.

- [ ] **Step 1: Write the failing pane tests**

`openspec-pane/hooks/register.test.ts`:
```ts
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
    turnId: `t${tokens}`, reason: 'answer', text: '', isAborted: false,
    usage: { input_tokens: tokens, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' },
  }) as never

const measure = (usd: number) =>
  ({ context: { window: 1_000_000 }, rateLimits: [], cost: { usd }, changed: ['cost'] }) as never

const ok = (stdout: string, exitCode = 0) =>
  ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }) as never

type Host = { list?: string | 'missing'; listExit?: number }

// The engine's side: a fake openspec CLI, file system, store and prompt box.
const stand = (on: On, host: Host = {}) => {
  const filled: string[] = []
  mock.store(on)
  on('process.run', (_$, e) => {
    if (e.argv[0] !== 'openspec') return ok('')
    // Read per call so a test can change the CLI's output mid-test.
    const list = host.list ?? LIST
    if (list === 'missing') throw new Error('spawn openspec ENOENT')
    if (e.argv[1] === 'list') return ok(list, host.listExit ?? 0)
    if (e.argv[1] === 'status') return ok(STATUS_FULL)
    return ok('')
  })
  on('fs.read', () => ({ value: TASKS_MD }) as never)
  on('prompt.fill', (_$, e) => (filled.push(e.text), { value: {} }) as never)
  on('prompt.submit', () => ({ value: {} }) as never)
  on('command.run', () => ({ value: { text: '' } }) as never)
  on('turn.complete', () => ({ value: {} }) as never)
  on('session.measure', (_$, e) => ({ value: { changed: e.changed } }) as never)
  on('session.end', () => ({ value: {} }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  return { filled }
}

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

test('missing CLI shows the install hint', async ($, on) => {
  stand(on, { list: 'missing' })
  const ui = await open($, 'terminal')
  expect(await ui.find({ type: 'Text', text: 'openspec CLI not found — npm i -g @fission-ai/openspec' })).toBeTruthy()
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `claude plugin test ~/.claude/mods/openspec-pane`
Expected: register tests FAIL — no `register.tsx`; the 12 module tests still pass.

- [ ] **Step 3: Implement `register.tsx`**

`openspec-pane/hooks/register.tsx`:
```tsx
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ChangeDetail, Current, Ledger, Project } from '../types'
import { firstUnchecked, nextSteps, parseList, parseStatus, pickActive } from './openspec'
import { addSpend, changeTotal, parseOpsx, usageTokens } from './spend'

const PANE = 'openspec-pane'
const TITLE = 'OpenSpec'
const POLL_MS = 10_000
const MISSING_CLI = 'openspec CLI not found — npm i -g @fission-ai/openspec'

const S = 'openspec-pane' as const
const project = atom({ plugin: S, key: 'project' } as const, null)
const detail = atom({ plugin: S, key: 'detail' } as const, null)
const active = atom({ plugin: S, key: 'active' } as const, null)
const current = atom({ plugin: S, key: 'current' } as const, null)
const ledger = atom({ plugin: S, key: 'ledger' } as const, {})
const error = atom({ plugin: S, key: 'error' } as const, null)
const showOthers = atom({ plugin: S, key: 'showOthers' } as const, false)

const k = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`)

export const register: Register = on => {
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
    void refresh($)
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
        {problem !== null && <Text color="error">{cut(problem)}</Text>}
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
```

- [ ] **Step 4: Run the tests and validator**

Run: `claude plugin test ~/.claude/mods/openspec-pane && claude plugin validate ~/.claude/mods/openspec-pane`
Expected: all tests pass (12 module + 11 pane), `✔ Validation passed`.

Likely fixes if tests fail, in order of likelihood:
- A stand-in answer shape is refused (`returned neither { value } nor { deny }`): wrap it in `{ value: … }`; for `session.measure`/`command.run` answers try the bare object if `{ value }` is refused.
- `$.turn.complete` / `$.session.end` input refused by the engine: read `TurnCompleteInput` / `SessionEndInput` in the types file and add the missing required fields to `turn()` / the end call.
- A spend-row regex misses because of padding: print `JSON.stringify(await ui.drawn())` once, adjust the regex to the drawn text, then remove the print.

- [ ] **Step 5: Type-check**

Run (scratch tsconfig outside the mod, as for the other mods):
```bash
S=$TMPDIR/tsc-openspec; mkdir -p $S; cat > $S/tsconfig.json <<EOF
{ "compilerOptions": { "target": "es2023", "lib": ["es2023"], "types": [], "module": "esnext", "moduleResolution": "bundler",
  "strict": true, "noUncheckedIndexedAccess": true, "noEmit": true, "skipLibCheck": true,
  "jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment" },
  "include": ["<path to this build's claude-code.d.ts>", "$HOME/.claude/mods/openspec-pane/hooks", "$HOME/.claude/mods/openspec-pane/types"] }
EOF
npx -y -p typescript@5 tsc -p $S/tsconfig.json
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
cd ~/.claude/mods && git add openspec-pane && git commit -m "openspec-pane: pane, spend tracking and next-step buttons"
```

---

### Task 4: Publish in the marketplace

**Files:**
- Modify: `.claude-plugin/marketplace.json` (add entry)
- Modify: `README.md` (add row and install line)
- Create: `openspec-pane/README.md`

**Interfaces:**
- Consumes: the working mod from Task 3.
- Produces: `openspec-pane@claude-code-mods` installable from GitHub and installed locally.

- [ ] **Step 1: Add the marketplace entry**

In `.claude-plugin/marketplace.json`, append to `plugins`:
```json
{ "name": "openspec-pane", "source": "./openspec-pane", "description": "OpenSpec active change, task progress, spend per OPSX step and next-step buttons in a side pane" }
```

- [ ] **Step 2: Update the root README**

Add a row to the mods table:
```markdown
| [openspec-pane](openspec-pane) | Side pane for [OpenSpec](https://github.com/Fission-AI/OpenSpec): active change, artifact and task progress, tokens and cost per OPSX step, and buttons for the next step. |
```
and under Install:
```
/plugin install openspec-pane --marketplace kk5190/claude-code-mods
```

- [ ] **Step 3: Write `openspec-pane/README.md`**

```markdown
# openspec-pane

A Claude Code mod for [OpenSpec](https://github.com/Fission-AI/OpenSpec) users: a side pane showing the change you are working on, its progress, and what each OPSX step has cost.

```
┌ OpenSpec ─────────────────────────┐
│ add-dark-mode-toggle              │
│ ● proposal ● specs ● design ● tasks│
│ ████████░░░░░░░░  6/14 tasks      │
│ Next: 2.3 Persist theme choice    │
│                                   │
│ Spend on this change              │
│ propose     38k tok   $0.41       │
│ apply ▸    620k tok   $2.95       │
│ Total      658k tok   $3.36       │
│                                   │
│ [ Apply ]  1 other                │
└───────────────────────────────────┘
```

- **Active change**: the one named in your last `/opsx:<step> <change>`, or picked with `/opsx-change <change>`; otherwise the most recently modified change in progress.
- **Progress**: artifacts present (●) or missing (○), tasks done, and the next unchecked task.
- **Spend per step**: after `/opsx:<step>`, every turn's tokens and cost count toward that step until the next `/opsx:` command or `/clear`. Totals are kept per project and change across sessions.
- **Next step**: Continue, Apply, or Verify and Archive, depending on the change. A button fills the prompt; press Enter to run it.

The pane opens with the session in any project with an OpenSpec root. Reads state through the `openspec` CLI (1.9 or later).

## Install

```
/plugin install openspec-pane --marketplace kk5190/claude-code-mods
```

## License

MIT. See [LICENSE](../LICENSE).
```

- [ ] **Step 4: Validate the marketplace, check for real data, install locally**

```bash
cd ~/.claude/mods && claude plugin validate . && claude plugin validate openspec-pane && claude plugin test openspec-pane
git grep -n -i -E "$(ls ~/workspace | paste -sd'|' -)" -- openspec-pane docs README.md .claude-plugin || echo "no real project names"
claude plugin install openspec-pane@claude-code-mods --scope user
```
Expected: validation passes, tests pass, `no real project names` (inspect any match by eye: common words can match a folder name), plugin installed and read from `~/.claude/mods/openspec-pane`.

- [ ] **Step 5: Commit and push**

```bash
cd ~/.claude/mods && git add -A && git commit -m "Add openspec-pane to the marketplace" && git push origin main
```

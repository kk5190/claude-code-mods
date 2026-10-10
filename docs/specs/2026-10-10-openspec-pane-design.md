# OpenSpec pane — Stage 1 design

A Claude Code mod that shows the OpenSpec change you are working on, what it has cost per OPSX step, and buttons for the next step.

## Goal

When working through an OpenSpec change with Claude, see at a glance:

- which change is active, which of its artifacts exist, and how far its tasks have got;
- how many tokens and dollars each OPSX step (propose, apply, verify, …) has spent on that change;
- the next sensible OPSX step, one press away.

Later stages (not in this spec): Stage 2 keeps Claude on the active change and task; Stage 3 groups file changes by task.

## Scope

**In:** a side pane, active-change selection, artifact and task progress, per-step spend tracking persisted across sessions, next-step buttons that fill the prompt, a `/opsx-change` picker command.

**Out:** changing Claude's instructions, per-task file tracking, editing OpenSpec files, running the `openspec` CLI for anything but reading.

## Data source

The mod reads OpenSpec state only through the `openspec` CLI's JSON output, run in the session's working directory:

| Need | Command |
|---|---|
| Is there an OpenSpec root; which changes; task counts; status | `openspec list --json` |
| Which artifacts exist for a change | `openspec status --change <name> --json` (`artifactPaths.<artifact>.existingOutputPaths` non-empty means present) |
| Next unchecked task | first `- [ ]` line of the tasks artifact path that `status` reports |

Using the CLI keeps the mod correct for custom schemas, stores and future layout changes. Reading `tasks.md` is limited to finding the first unchecked line at the path the CLI names.

## Active change

The active change for a project root is, in order:

1. the change named by the most recent `/opsx:<step> <change>` prompt in that root, or picked with `/opsx-change`;
2. otherwise the in-progress change (`status != "complete"`) with the latest `lastModified`;
3. otherwise none — the pane shows "No change in progress".

A `/opsx:<step>` prompt without a change name keeps the current active change.

## Spend tracking

- A prompt whose text starts with `/opsx:<step>` sets the **current step** for the active change (sticky).
- Each `turn.complete` (main loop and subagents) adds its `usage` tokens (`input + output + cache_read + cache_creation`) to the current step.
- Each `session.measure` whose `cost.usd` grew adds the growth to the current step.
- The current step ends at the next `/opsx:` prompt, `/clear`, or session end. Turns with no current step are not attributed.
- Totals are stored in `$.store` under the project root, keyed `change → step → { tokens, usd }`, so they survive sessions and reloads.

## Pane

Title "OpenSpec". Opens at session start only when `openspec list` finds a root. `/opsx-change` opens it too.

```
┌ OpenSpec ─────────────────────────┐
│ add-dark-mode-toggle              │
│ ● proposal ● specs ● design ○ tasks│
│ ████████░░░░░░░░  6/14 tasks      │
│ Next: 2.3 Persist theme choice    │
│                                   │
│ Spend on this change              │
│ propose     38k tok   $0.41       │
│ apply ▸    620k tok   $2.95       │
│ Total      658k tok   $3.36       │
│                                   │
│ [ Apply ] [ Verify ]  1 other     │
└───────────────────────────────────┘
```

- Artifacts: ● present, ○ missing, in the schema's order.
- Task bar sized to the pane width, with `done/total`.
- Spend rows only for steps that have spend; ▸ marks the current step.
- "N other" lists other in-progress changes; choosing one makes it active.

### Next-step buttons

| Change state | Buttons |
|---|---|
| Some artifacts missing | Continue |
| Artifacts present, tasks remaining | Apply |
| All tasks done | Verify, Archive |

A button fills the prompt with `/opsx:<step> <change>` (`$.prompt.fill`); the person presses Enter or edits first.

## Refresh

Re-read after each `turn.complete`, after any tool call that writes under `openspec/`, on `/opsx-change`, and every 10 s while the pane is placed.

## Errors

| Case | Behaviour |
|---|---|
| `openspec` not on PATH | Pane shows "openspec CLI not found — npm i -g @fission-ai/openspec" |
| CLI exits non-zero or JSON fails to parse | Pane shows the error line and keeps the last good data |
| No OpenSpec root | Pane is not opened; `/opsx-change` replies "No OpenSpec project here" |

## Code layout

```
openspec-pane/
  .claude-plugin/plugin.json
  hooks/hooks.json
  hooks/register.tsx      events, refresh, pane, buttons
  hooks/openspec.ts       pure: parse CLI JSON, pick active change, next buttons, first unchecked task
  hooks/spend.ts          pure: parse /opsx prompts, add usage to a ledger
  hooks/fixtures.ts       made-up CLI output
  hooks/*.test.ts
  types/index.d.ts        state contract
  README.md
```

## Testing

All fixtures are made up; nothing is taken from real projects.

- `openspec.ts`: list/status parsing, active-change rules 1–3, button states, first unchecked task.
- `spend.ts`: `/opsx:` prompt parsing (with and without change name), sticky attribution, reset on `/clear`, usage and cost accumulation.
- Pane, on terminal and desktop with a fake CLI: render of a change, spend rows, the right buttons per state, a button filling the prompt, the "CLI not found" state.

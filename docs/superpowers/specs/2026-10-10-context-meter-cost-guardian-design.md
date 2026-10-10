# context-meter: cost guardian (design)

Date: 2026-10-10
Scope: one feature added to the existing `context-meter` plugin. No new pane, no new plugin.

## Goal

Make per-turn and session cost visible in the Context pane, and warn (never block) when a turn or the session gets expensive. Personal use only.

## Non-goals

- No blocking or confirmation prompts. Warning only.
- No model price table. Costs come from the cost the harness already reports.
- No context inspector. That is a separate mod, pending a check of what the API exposes.

## Data

Each `session.measure` event already gives `e.context` (`tokens`, `window`, `percent`) and optionally `e.cost?.usd`. The plugin already stores `usd` on each `Reading`.

Assumption, to verify before the plan: `e.cost.usd` is cumulative for the session.

## State

Add two fields to `PluginState['context-meter']` in `types/index.d.ts`:

- `lastUsd: number | null`: the cumulative cost at the previous measurement. Used to derive the last turn's cost.
- `turnWarned: boolean`: the per-turn warning has fired and not re-armed.
- `budgetWarned: boolean`: the session budget warning has fired. Stays set until the session restarts.

## Derived values

- `lastTurnUsd = usd - lastUsd`, when both are present.
- If `usd < lastUsd`, treat it as a reset (a new session, or a clear that resets cost). Set `lastTurnUsd` to `null` and continue from the new value.
- `nextTurnUsd ≈ lastTurnUsd`. This is a rough estimate from the last turn, not a forecast.

Keep the arithmetic in a pure function so it can be tested without the UI.

## Thresholds

Constants at the top of `hooks/register.tsx`, next to `WARN_TOKENS` and `ALERT_TOKENS`:

- `TURN_WARN_USD = 0.5`: warn when one turn costs at least this much.
- `SESSION_BUDGET_USD = undefined`: off by default. Set a number to enable the session budget warning.

## Behavior

- **Per turn:** if `lastTurnUsd >= TURN_WARN_USD` and `turnWarned` is false, show a toast once and set `turnWarned`. When a turn falls below the threshold, clear `turnWarned` so the next crossing warns again.
- **Session budget:** if `SESSION_BUDGET_USD` is set and `usd >= SESSION_BUDGET_USD` and `budgetWarned` is false, show a toast once and set `budgetWarned`. Do not re-arm within the session.
- **Pane rows** (added below "Session cost", only when cost is known):
  - `Last turn $0.12`, in the warning color when over `TURN_WARN_USD`.
  - `Next turn ≈ $0.12`.
  - `Budget $3.20 of $5.00`, only when a budget is set.
- Nothing changes when `e.cost` is absent. The existing rows stay as they are.

## Error handling

- Missing `e.cost`: skip cost rows and warnings. Do not write `lastUsd`.
- Negative delta: treat as a reset, as above. Do not warn on a reset.

## Testing

Extend `hooks/register.test.ts`, following its existing style:

- Turn delta from two cumulative readings.
- Reset when cost decreases: no warning, no negative value.
- Turn warning fires once per crossing and re-arms after a cheap turn.
- Budget warning fires once and does not re-arm.
- Missing cost: no rows, no toasts, no crash.

## Assumptions to verify before planning

1. `e.cost.usd` is cumulative per session.
2. `/clear` either resets cost or leaves it cumulative. Both are handled, but the test should match the real behavior.
3. `e.cost` is present on most turns, not only some.

## Open items

None. Thresholds are placeholders you can tune after a few sessions.

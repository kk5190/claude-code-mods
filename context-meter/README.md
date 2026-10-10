# context-meter

A Claude Code mod that adds a **Context** widget in a side pane, so you can see how big the conversation has grown before it gets expensive.

```
┌ Context ─────────────┐
│ 14%                  │
│ ███░░░░░░░░░░░░░░░░░ │
│ 142k of 1M tokens    │
│                      │
│ Status       Healthy │
│ Re-sent each turn 142k│
│ Session cost   $3.20 │
└──────────────────────┘
```

Every turn re-sends the whole context, so a long session costs more per turn the longer it runs. The widget turns that into something you can see:

| Context size | Color | Status |
|---|---|---|
| under 100k tokens | green | Healthy |
| 100k–200k | amber | Growing |
| over 200k | red | Compact now, plus a one-time toast suggesting `/compact` or `/clear` |

It updates after every turn, sizes its bar to the pane, and shows nothing until the first response of a session.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install context-meter --marketplace kk5190/claude-code-mods
```

Answer `y` to add the marketplace, then press Enter to install at user scope.

The pane opens by itself when the terminal is wide enough for a sidebar (144 columns, or 110 in fullscreen). Otherwise open it with:

```
/context-meter
```

## Customize

The thresholds are `WARN_TOKENS` and `ALERT_TOKENS` at the top of [`hooks/register.tsx`](hooks/register.tsx).

## Develop

```sh
claude --plugin-dir .          # run a session with this folder loaded; edits hot-reload
claude plugin validate .
claude plugin test .
```

## License

MIT. See [LICENSE](../LICENSE).

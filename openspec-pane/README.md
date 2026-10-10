# openspec-pane

A Claude Code mod for [OpenSpec](https://github.com/Fission-AI/OpenSpec) users: a side pane showing the change you are working on, its progress, and what each OPSX step has cost.

```
┌ OpenSpec ──────────────────────────┐
│ add-dark-mode-toggle               │
│ ● proposal ● specs ● design ● tasks│
│ ████████░░░░░░░░  6/14 tasks       │
│ Next: 2.3 Persist theme choice     │
│                                    │
│ Spend on this change               │
│ propose     38k tok   $0.41        │
│ apply ▸    620k tok   $2.95        │
│ Total      658k tok   $3.36        │
│                                    │
│ [ Apply ]  1 other                 │
└────────────────────────────────────┘
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

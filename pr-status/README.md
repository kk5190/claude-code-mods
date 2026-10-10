# pr-status

A Claude Code mod that shows the current branch's pull request in a side pane:

```
PR       #12 Add guard
Review   approved
Checks   2 passing, 1 failing, 0 pending
```

The pane opens when a session starts. Reopen it with `/pr-status`. It refreshes when a session starts and when each turn ends. It reads `gh pr view` and `gh pr checks`, so `gh` must be installed and logged in.

Other states:

- `no PR for this branch`: the branch has no pull request.
- `PR status unavailable`: `gh` is missing, not logged in, or failed.

## Limits

- Unresolved review thread counts are not shown yet. They need a GraphQL query, which this version doesn't make.
- The pane refreshes only at session start and turn end, so a PR changed from the browser shows up after the next turn.

## Install

```
/plugin install pr-status --marketplace kk5190/claude-code-mods
```

## Develop

```sh
claude --plugin-dir .          # run a session with this folder loaded; edits hot-reload
claude plugin validate .
claude plugin test .
```

## License

MIT. See [LICENSE](../LICENSE).

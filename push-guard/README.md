# push-guard

A Claude Code mod that stops `git push` and `gh pr create` until you confirm.

When Claude runs one of those commands, a dialog shows:

- the command
- the commits not yet on the upstream branch, and the diff size
- an **Author check failed** list for any commit whose author isn't `kk5190`

Choose **Continue** to run it, or **Cancel** to refuse. If nobody answers, the command is refused.

The side pane shows the last check: the command, the commits, any author warning, and the outcome (waiting, continued, cancelled, or refused). It opens when a session starts. Reopen it with `/push-guard`.

## Limits

- It matches on the command text. A push hidden behind an alias, a script, or a sub-shell won't be caught.
- The commit list comes from the upstream branch. With no upstream set, the dialog says it could not list the commits.

## Install

```
/plugin install push-guard --marketplace kk5190/claude-code-mods
```

## Develop

```sh
claude --plugin-dir .          # run a session with this folder loaded; edits hot-reload
claude plugin validate .
claude plugin test .
```

## License

MIT. See [LICENSE](../LICENSE).

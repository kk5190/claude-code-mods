# claude-code-mods

Mods for [Claude Code](https://claude.com/claude-code): small plugins that add panes and commands to the terminal UI.

| Mod | What it does |
|---|---|
| [context-meter](context-meter) | Side pane showing context size, a fill bar, status and session cost, with a nudge to `/compact` or `/clear` past 200k tokens. |
| [dev-servers](dev-servers) | Side pane listing local dev servers (project, port, uptime) with **Open**, **Restart** and **Kill**. |

## Install

At the prompt of a Claude Code terminal session, install any mod by name:

```
/plugin install context-meter --marketplace kk5190/claude-code-mods
/plugin install dev-servers --marketplace kk5190/claude-code-mods
```

Answer `y` to add the marketplace the first time, then press Enter to install at user scope.

## Develop

Each mod is a folder with `.claude-plugin/plugin.json`, `hooks/` and `types/`.

```sh
claude --plugin-dir ./dev-servers   # run a session with one mod loaded; edits hot-reload
claude plugin validate ./dev-servers
claude plugin test ./dev-servers
```

## License

MIT

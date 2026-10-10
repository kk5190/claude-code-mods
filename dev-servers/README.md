# dev-servers

A Claude Code mod that lists the dev servers running on your machine in a side pane.

```
┌ Dev servers ─────────────────────┐
│ shop-web                      :4321 │
│ astro dev · up 2h 5m             │
│ Open [ Restart ] [ Kill ]        │
└──────────────────────────────────┘
```

- **Finds** every process listening on a TCP port below 49152 whose runtime is a dev runtime (node, bun, deno, python, ruby, php, java, go …), refreshed every 5 seconds. System services such as AirPlay are left out.
- **Shows** the project (the server's working directory), its ports, the tool it runs (`astro dev` rather than the full `node …/node_modules/.bin/astro dev`) and its uptime.
- **Open** opens `http://localhost:<port>`.
- **Kill** sends SIGTERM, then SIGKILL if the server is still running after 5 seconds.
- **Restart** stops it and runs the same command again from the same directory, detached so it outlives the Claude Code session. Output goes to `$TMPDIR/dev-servers-<port>.log`.

The pane opens with the session when the terminal is wide enough for a sidebar; otherwise run `/dev-servers`.

macOS and Linux (uses `lsof` and `ps`).

## Install

```
/plugin install dev-servers --marketplace kk5190/claude-code-mods
```

## Limits

Restart rebuilds the command from the process list, which does not keep shell quoting: a server started with an argument containing spaces may not relaunch correctly. Use Kill and start it yourself in that case.

## License

MIT. See [LICENSE](../LICENSE).

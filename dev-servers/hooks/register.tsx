import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pending, Server } from '../types'
import { label, parseListening, toServers } from './servers'

const PANE = 'dev-servers'
const TITLE = 'Dev servers'
const POLL_MS = 5000
const STOP_WAIT_MS = 5000

const servers = atom({ plugin: 'dev-servers', key: 'servers' } as const, [])
const pending = atom({ plugin: 'dev-servers', key: 'pending' } as const, {})
const error = atom({ plugin: 'dev-servers', key: 'error' } as const, null)

const scan = async ($: EngineInterface) => {
  try {
    // lsof exits 1 when nothing listens; that is an empty list, not a failure.
    const listening = await $.process.run(['lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'])
    const pids = [...parseListening(listening.stdout).keys()].join(',')
    if (!pids) {
      await update($, servers, () => [])
    } else {
      const [ps, cwd] = await Promise.all([
        $.process.run(['ps', '-ww', '-o', 'pid=,etime=,command=', '-p', pids]),
        $.process.run(['lsof', '-a', '-d', 'cwd', '-Fpn', '-p', pids]),
      ])
      await update($, servers, () => toServers(listening.stdout, ps.stdout, cwd.stdout))
    }
    await update($, error, () => null)
  } catch (err) {
    await update($, error, () => `Could not list servers: ${String(err)}`)
  }
}

const isAlive = async ($: EngineInterface, pid: number) =>
  (await $.process.run(['kill', '-0', String(pid)])).exitCode === 0

// SIGTERM first so the server can shut down cleanly; SIGKILL only if it ignores that.
const stop = async ($: EngineInterface, pid: number) => {
  await $.process.run(['kill', String(pid)])
  for (let waited = 0; waited < STOP_WAIT_MS; waited += 250) {
    if (!(await isAlive($, pid))) return
    await $.clock.sleep(250)
  }
  await $.process.run(['kill', '-9', String(pid)])
}

const setPending = ($: EngineInterface, pid: number, state: Pending | null) =>
  update($, pending, all => {
    const { [pid]: _, ...rest } = all
    return state === null ? rest : { ...rest, [pid]: state }
  })

const kill = async ($: EngineInterface, server: Server) => {
  await setPending($, server.pid, 'stopping')
  try {
    await stop($, server.pid)
    $.ui.toast(`Stopped ${label(server.command)} on :${server.ports[0]}`)
  } finally {
    await setPending($, server.pid, null)
    await scan($)
  }
}

// Re-runs the same command line from the same directory, detached so it outlives this session.
const restart = async ($: EngineInterface, server: Server) => {
  await setPending($, server.pid, 'restarting')
  try {
    await stop($, server.pid)
    const port = String(server.ports[0])
    await $.process.run([
      'sh', '-c',
      'cd "$1" && nohup sh -c "$2" >"${TMPDIR:-/tmp}/dev-servers-$3.log" 2>&1 &',
      'sh', server.cwd, server.command, port,
    ])
    $.ui.toast(`Restarting ${label(server.command)} on :${port}`)
    await $.clock.sleep(1500)
  } finally {
    await setPending($, server.pid, null)
    await scan($)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'dev-servers', description: 'Show running dev servers in a pane' })
    void $.ui.open({ id: PANE, title: TITLE })
    void scan($)
    $.clock.every(POLL_MS, () => void scan($))

    return next(e)
  })

  on('command.run', { command: 'dev-servers' }, async $ => {
    await scan($)
    await $.ui.open({ id: PANE, title: TITLE, focus: true })

    return { text: 'Dev servers opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const list = await read($, servers)
    const busy = await read($, pending)
    const problem = await read($, error)
    const width = Math.max(20, e.props.bodyColumns - 2)
    const cut = (s: string) => (s.length > width ? `${s.slice(0, width - 1)}…` : s)

    return (
      <Box flexDirection="column" paddingX={1}>
        {problem !== null && <Text color="error">{cut(problem)}</Text>}
        {list.length === 0 && problem === null && <Text dimColor>No dev servers running.</Text>}
        {list.map((server, i) => {
          const url = `http://localhost:${server.ports[0]}`
          const state = busy[server.pid]

          return (
            <Box key={`server-${server.pid}`} flexDirection="column" marginTop={i === 0 ? 0 : 1}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text bold>{cut(server.project)}</Text>
                <Text color="success">{server.ports.map(p => `:${p}`).join(' ')}</Text>
              </Box>
              <Text dimColor>{cut(`${label(server.command)} · up ${server.uptime}`)}</Text>
              {state ? (
                <Text color="warning">{state === 'restarting' ? 'Restarting…' : 'Stopping…'}</Text>
              ) : (
                <Box flexDirection="row" gap={1}>
                  <Link href={url} label="Open" />
                  <Button key={`restart-${server.pid}`} label="Restart" onPress={() => restart($, server)} />
                  <Button key={`kill-${server.pid}`} label="Kill" onPress={() => kill($, server)} />
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    )
  })
}

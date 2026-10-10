import type { Server } from '../types'

// Runtimes that serve dev builds; anything else listening (AirPlay, Spotify, rapportd) is left out.
const RUNTIMES = /^(node|bun|deno|python[\d.]*|ruby|php|java|go|cargo|uvicorn|gunicorn|flask|vite|next-server|astro)$/
// Ports at or above 49152 are ephemeral (kernels, debuggers, IPC), not servers you browse to.
const EPHEMERAL = 49152

const basename = (path: string) => path.replace(/\/+$/, '').split('/').pop() ?? path

/** `lsof -nP -iTCP -sTCP:LISTEN -Fpn` → listening ports per pid. */
export const parseListening = (text: string): Map<number, number[]> => {
  const ports = new Map<number, number[]>()
  let pid = 0
  for (const line of text.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1))
    if (line.startsWith('n') && pid) {
      const port = Number(line.slice(line.lastIndexOf(':') + 1))
      if (port > 0 && port < EPHEMERAL) {
        const list = ports.get(pid) ?? []
        if (!list.includes(port)) ports.set(pid, [...list, port].sort((a, b) => a - b))
      }
    }
  }
  return ports
}

/** `ps -ww -o pid=,etime=,command= -p …` → elapsed time and full command per pid. */
export const parseProcesses = (text: string): Map<number, { etime: string; command: string }> => {
  const procs = new Map<number, { etime: string; command: string }>()
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+(.+)$/)
    if (m) procs.set(Number(m[1]), { etime: m[2]!, command: m[3]! })
  }
  return procs
}

/** `lsof -a -d cwd -p … -Fpn` → working directory per pid. */
export const parseCwds = (text: string): Map<number, string> => {
  const cwds = new Map<number, string>()
  let pid = 0
  for (const line of text.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1))
    if (line.startsWith('n') && pid) cwds.set(pid, line.slice(1))
  }
  return cwds
}

export const isDevServer = (command: string) => RUNTIMES.test(basename(command.split(/\s+/)[0] ?? ''))

/** `ps` etime (`[[dd-]hh:]mm:ss`) → `3d 2h`, `2h 5m`, `4m`, `20s`. */
export const humanize = (etime: string) => {
  const [days, clock] = etime.includes('-') ? etime.split('-') : ['0', etime]
  const parts = clock!.split(':').map(Number)
  const [h, m, s] = parts.length === 3 ? parts : [0, ...parts]
  const d = Number(days)
  if (d > 0) return `${d}d ${h}h`
  if (h! > 0) return `${h}h ${m}m`
  if (m! > 0) return `${m}m`
  return `${s}s`
}

/** A command line with paths shortened to their last segment: `node …/.bin/astro dev` → `astro dev`. */
export const label = (command: string) => {
  const raw = command.split(/\s+/)
  // A script inside node_modules is named by its package, followed by its own arguments.
  const at = raw.findIndex(w => w.includes('node_modules/'))
  if (at >= 0) {
    const bin = raw[at]!.match(/node_modules\/\.bin\/([^/]+)|node_modules\/((?:@[^/]+\/)?[^/]+)/)
    return [bin?.[1] ?? bin?.[2] ?? basename(raw[at]!), ...raw.slice(at + 1)].join(' ')
  }
  return raw.map(w => (w.includes('/') ? basename(w) : w)).join(' ')
}

export const toServers = (listening: string, ps: string, cwd: string): Server[] => {
  const ports = parseListening(listening)
  const procs = parseProcesses(ps)
  const cwds = parseCwds(cwd)
  const servers: Server[] = []
  for (const [pid, list] of ports) {
    const proc = procs.get(pid)
    if (!proc || !isDevServer(proc.command)) continue
    const dir = cwds.get(pid) ?? ''
    servers.push({
      pid,
      ports: list,
      project: dir ? basename(dir) : '?',
      cwd: dir,
      command: proc.command,
      uptime: humanize(proc.etime),
    })
  }
  return servers.sort((a, b) => a.ports[0]! - b.ports[0]!)
}

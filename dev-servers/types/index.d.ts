export type Server = {
  pid: number
  ports: number[]
  project: string
  cwd: string
  command: string
  uptime: string
}

export type Pending = 'restarting' | 'stopping'

declare module 'claude-code' {
  interface PluginState {
    'dev-servers': { servers: Server[]; pending: Record<string, Pending>; error: string | null }
  }
}

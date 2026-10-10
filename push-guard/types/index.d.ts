export type Outcome = 'checking' | 'continued' | 'cancelled' | 'refused'

// The last publish command the guard looked at, as the pane shows it.
export type Check = { command: string; lines: string[]; warnings: string[]; outcome: Outcome }

declare module 'claude-code' {
  interface PluginState {
    'push-guard': { lastCheck: Check | null }
  }
}

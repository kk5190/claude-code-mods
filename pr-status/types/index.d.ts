export type Checks = { passing: number; failing: number; pending: number }

export type PrStatus =
  | { kind: 'pr'; number: number; title: string; review: string; checks: Checks }
  | { kind: 'none' }
  | { kind: 'unavailable' }

declare module 'claude-code' {
  interface PluginState {
    'pr-status': { status: PrStatus | null }
  }
}

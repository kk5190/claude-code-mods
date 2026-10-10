export type Reading = { tokens: number; window: number; percent: number; usd?: number }

declare module 'claude-code' {
  interface PluginState {
    'context-meter': { reading: Reading | null; hasWarned: boolean }
  }
}

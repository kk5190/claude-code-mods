export type Reading = { tokens: number; window: number; percent: number; usd?: number; turnUsd?: number }

declare module 'claude-code' {
  interface PluginState {
    'context-meter': {
      reading: Reading | null
      hasWarned: boolean
      lastUsd: number | undefined
      turnWarned: boolean
      budgetWarned: boolean
    }
  }
}

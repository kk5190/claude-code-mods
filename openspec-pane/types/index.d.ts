export type ChangeSummary = {
  name: string
  completedTasks: number
  totalTasks: number
  lastModified: string
  status: string
}

export type Project = { root: string; changes: ChangeSummary[] }

export type Artifact = { id: string; present: boolean }

export type ChangeDetail = { name: string; artifacts: Artifact[]; nextTask: string | null }

export type Step = 'continue' | 'apply' | 'verify' | 'archive'

export type StepSpend = { tokens: number; usd: number }

/** change name → OPSX step → spend */
export type Ledger = Record<string, Record<string, StepSpend>>

export type Current = { change: string; step: string } | null

declare module 'claude-code' {
  interface PluginState {
    'openspec-pane': {
      project: Project | null
      detail: ChangeDetail | null
      active: string | null
      current: Current
      ledger: Ledger
      error: string | null
      showOthers: boolean
    }
  }
}

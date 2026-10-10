import type { Current, Ledger, StepSpend } from '../types'

/** `/opsx:<step> [change]` at the start of a prompt → its step and change. */
export const parseOpsx = (text: string): { step: string; change: string | null } | null => {
  const m = text.trim().match(/^\/opsx:([a-z][a-z-]*)(?:\s+(\S+))?/)
  return m ? { step: m[1]!, change: m[2] ?? null } : null
}

export const usageTokens = (u: {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}) => u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens

/** Adds spend to the current change and step; spend with no current step is not attributed. */
export const addSpend = (ledger: Ledger, current: Current, add: Partial<StepSpend>): Ledger => {
  if (current === null) return ledger
  const steps = ledger[current.change] ?? {}
  const was = steps[current.step] ?? { tokens: 0, usd: 0 }
  const now = { tokens: was.tokens + (add.tokens ?? 0), usd: was.usd + (add.usd ?? 0) }
  return { ...ledger, [current.change]: { ...steps, [current.step]: now } }
}

export const changeTotal = (steps: Record<string, StepSpend> | undefined): StepSpend =>
  Object.values(steps ?? {}).reduce((t, s) => ({ tokens: t.tokens + s.tokens, usd: t.usd + s.usd }), { tokens: 0, usd: 0 })

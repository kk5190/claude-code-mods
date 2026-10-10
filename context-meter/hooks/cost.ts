// Pure cost arithmetic for the cost guardian. No engine imports, so it runs under plain tests.

// Increase since the last cumulative reading. Undefined when there is no baseline yet,
// or when the total went down (a new session, or a clear that resets cost).
export const turnCost = (lastUsd: number | undefined, usd: number): number | undefined => {
  if (lastUsd === undefined || usd < lastUsd) return undefined
  return usd - lastUsd
}

// No budget set means never over.
export const overBudget = (usd: number, budget: number | undefined): boolean =>
  budget !== undefined && usd >= budget

// Pane row value, or undefined when no budget is set.
export const budgetRow = (usd: number, budget: number | undefined): string | undefined =>
  budget === undefined ? undefined : `$${usd.toFixed(2)} of $${budget.toFixed(2)}`

export const budgetToast = (usd: number, budget: number): string =>
  `Session cost is $${usd.toFixed(2)}, over your $${budget.toFixed(2)} budget`

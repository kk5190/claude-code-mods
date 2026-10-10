// Pure logic for the PR status band. No engine imports, so it runs under plain tests.

import type { Checks, PrStatus } from '../types'

const REVIEW: Record<string, string> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes requested',
  REVIEW_REQUIRED: 'review required',
}

// Input is `gh pr view --json number,title,reviewDecision`.
export const parsePr = (json: string): { number: number; title: string; review: string } => {
  const pr = JSON.parse(json) as { number: number; title: string; reviewDecision: string }
  return { number: pr.number, title: pr.title, review: REVIEW[pr.reviewDecision] ?? 'no review yet' }
}

// Input is `gh pr checks --json bucket`. Unreadable output counts as nothing rather than failing the band.
export const countChecks = (json: string): Checks => {
  const counts: Checks = { passing: 0, failing: 0, pending: 0 }
  try {
    for (const { bucket } of JSON.parse(json) as { bucket: string }[]) {
      if (bucket === 'pass') counts.passing += 1
      else if (bucket === 'fail') counts.failing += 1
      else if (bucket === 'pending') counts.pending += 1
    }
  } catch {
    // Left at zero.
  }
  return counts
}

// `gh pr view` fails with this text when the branch has no PR; any other failure means gh could not answer.
export const classifyFailure = (stderr: string): 'none' | 'unavailable' =>
  stderr.includes('no pull requests found') ? 'none' : 'unavailable'

export const bandText = (status: PrStatus): string => {
  if (status.kind === 'none') return 'no PR for this branch'
  if (status.kind === 'unavailable') return 'PR status unavailable'
  const { passing, failing, pending } = status.checks
  return `#${status.number} ${status.title} · ${status.review} · checks: ${passing} passing, ${failing} failing, ${pending} pending`
}

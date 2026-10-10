import type { Register } from 'claude-code'

import { authorWarnings, isPublishCommand, parseCommits, summarize } from './guard'

const LOG = ['git', 'log', '--format=%an%x09%ae%x09%s', '@{u}..HEAD']
const STAT = ['git', 'diff', '--shortstat', '@{u}..HEAD']

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!isPublishCommand(e.command)) return next(e)

    let question: string
    try {
      const log = await $.process.run(LOG)
      const stat = await $.process.run(STAT)
      const commits = log.exitCode === 0 ? parseCommits(log.stdout) : []
      const body =
        log.exitCode === 0 ? summarize(commits, stat.stdout) : 'Could not list the commits (no upstream branch?).'
      const warnings = authorWarnings(commits)
      const warn = warnings.length > 0 ? `\nAuthor check failed:\n  ${warnings.join('\n  ')}` : ''
      question = `Run: ${e.command}\n${body}${warn}`
    } catch {
      return { deny: 'push-guard: could not read the commits, so the command was not run' }
    }

    try {
      const answer = await $.ui.ask(question, ['Continue', 'Cancel'])
      if (answer !== 'Continue') return { deny: 'push-guard: cancelled' }
    } catch {
      return { deny: 'push-guard: no answer, so the command was not run' }
    }

    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'push-guard: its check failed, so the command was not run' }))
}

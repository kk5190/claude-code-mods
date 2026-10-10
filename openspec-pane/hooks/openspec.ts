import type { Artifact, ChangeSummary, Project, Step } from '../types'

type ListJson = { root: { path: string } | null; changes: ChangeSummary[] }
type StatusJson = { artifactPaths?: Record<string, { existingOutputPaths?: string[] }> }

/** `openspec list --json` → the project, or null when no OpenSpec root was found. */
export const parseList = (stdout: string): Project | null => {
  const json = JSON.parse(stdout) as ListJson
  return json.root ? { root: json.root.path, changes: json.changes } : null
}

/** `openspec status --change <name> --json` → artifacts in schema order, and the tasks file if it exists. */
export const parseStatus = (stdout: string): { artifacts: Artifact[]; tasksPath: string | null } => {
  const paths = (JSON.parse(stdout) as StatusJson).artifactPaths ?? {}
  const artifacts = Object.entries(paths).map(([id, p]) => ({ id, present: (p.existingOutputPaths?.length ?? 0) > 0 }))
  return { artifacts, tasksPath: paths.tasks?.existingOutputPaths?.[0] ?? null }
}

/** The text of the first `- [ ]` line in a tasks file. */
export const firstUnchecked = (markdown: string): string | null =>
  markdown.match(/^\s*-\s\[ \]\s+(.+?)\s*$/m)?.[1] ?? null

/** The chosen change when it still exists, else the most recently modified change still in progress. */
export const pickActive = (changes: ChangeSummary[], chosen: string | null): string | null => {
  if (chosen && changes.some(c => c.name === chosen)) return chosen
  const open = changes.filter(c => c.status !== 'complete')
  open.sort((a, b) => b.lastModified.localeCompare(a.lastModified))
  return open[0]?.name ?? null
}

/** Which OPSX steps make sense next for a change. */
export const nextSteps = (change: ChangeSummary, artifacts: Artifact[]): Step[] => {
  if (artifacts.some(a => !a.present)) return ['continue']
  if (change.completedTasks < change.totalTasks) return ['apply']
  return ['verify', 'archive']
}

/** The steps a project has `/opsx:` commands for; `null` (commands unknown) keeps every step. */
export const availableSteps = (steps: Step[], commands: string[] | null): Step[] =>
  commands === null ? steps : steps.filter(s => commands.includes(s))

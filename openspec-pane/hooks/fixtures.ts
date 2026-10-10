// Made-up OpenSpec CLI output, shaped like openspec 1.9's JSON. Not from any real project.
export const ROOT = '/home/dev/shop-web'

export const LIST = JSON.stringify({
  changes: [
    { name: 'fix-cart-badge', completedTasks: 14, totalTasks: 14, lastModified: '2026-09-20T10:00:00.000Z', status: 'complete' },
    { name: 'add-dark-mode-toggle', completedTasks: 6, totalTasks: 14, lastModified: '2026-09-18T10:00:00.000Z', status: 'in-progress' },
    { name: 'refactor-header-nav', completedTasks: 0, totalTasks: 9, lastModified: '2026-09-01T10:00:00.000Z', status: 'in-progress' },
  ],
  root: { path: ROOT, source: 'nearest' },
})

export const LIST_NO_ROOT = JSON.stringify({
  changes: [],
  root: null,
  status: [{ severity: 'error', code: 'no_openspec_root', message: 'No OpenSpec root found from the current directory.' }],
})

const artifact = (rel: string, present: boolean) => ({
  outputPath: rel,
  resolvedOutputPath: `${ROOT}/openspec/changes/add-dark-mode-toggle/${rel}`,
  existingOutputPaths: present ? [`${ROOT}/openspec/changes/add-dark-mode-toggle/${rel}`] : [],
})

export const STATUS_FULL = JSON.stringify({
  changeName: 'add-dark-mode-toggle',
  schemaName: 'spec-driven',
  artifactPaths: {
    proposal: artifact('proposal.md', true),
    specs: artifact('specs/**/*.md', true),
    design: artifact('design.md', true),
    tasks: artifact('tasks.md', true),
  },
})

export const STATUS_NO_TASKS = JSON.stringify({
  changeName: 'refactor-header-nav',
  schemaName: 'spec-driven',
  artifactPaths: {
    proposal: artifact('proposal.md', true),
    specs: artifact('specs/**/*.md', false),
    design: artifact('design.md', false),
    tasks: artifact('tasks.md', false),
  },
})

export const TASKS_MD = [
  '# Tasks',
  '',
  '## 1. Theme tokens',
  '- [x] 1.1 Add light and dark token sets',
  '- [x] 1.2 Expose tokens as CSS variables',
  '',
  '## 2. Toggle',
  '- [x] 2.1 Add the toggle component',
  '- [x] 2.2 Wire it into the header',
  '- [ ] 2.3 Persist theme choice',
  '- [ ] 2.4 Respect prefers-color-scheme on first visit',
].join('\n')

import { describe, expect, test } from 'claude-code/testing'

import { LIST, LIST_NO_ROOT, ROOT, STATUS_FULL, STATUS_NO_TASKS, TASKS_MD } from './fixtures'
import { firstUnchecked, nextSteps, parseList, parseStatus, pickActive } from './openspec'

const change = (over: Partial<{ completedTasks: number; totalTasks: number }>) => ({
  name: 'add-dark-mode-toggle', completedTasks: 6, totalTasks: 14, lastModified: '', status: 'in-progress', ...over,
})
const all = (present: boolean) => ['proposal', 'specs', 'design', 'tasks'].map(id => ({ id, present }))

describe('openspec', () => {
  test('parseList reads root and changes', () => {
    const project = parseList(LIST)
    expect(project?.root).toBe(ROOT)
    expect(project?.changes.map(c => c.name)).toEqual(['fix-cart-badge', 'add-dark-mode-toggle', 'refactor-header-nav'])
  })

  test('parseList returns null when there is no OpenSpec root', () => {
    expect(parseList(LIST_NO_ROOT)).toBe(null)
  })

  test('parseList throws on output that is not JSON', () => {
    expect(() => parseList('Warning: something odd\n{')).toThrow()
  })

  test('parseStatus lists artifacts in schema order with presence and the tasks path', () => {
    expect(parseStatus(STATUS_FULL)).toEqual({
      artifacts: all(true),
      tasksPath: `${ROOT}/openspec/changes/add-dark-mode-toggle/tasks.md`,
    })
    const partial = parseStatus(STATUS_NO_TASKS)
    expect(partial.artifacts.map(a => a.present)).toEqual([true, false, false, false])
    expect(partial.tasksPath).toBe(null)
  })

  test('firstUnchecked returns the first open task, or null', () => {
    expect(firstUnchecked(TASKS_MD)).toBe('2.3 Persist theme choice')
    expect(firstUnchecked('- [x] 1.1 Done')).toBe(null)
    expect(firstUnchecked('')).toBe(null)
  })

  test('pickActive prefers an existing chosen change, else the newest in-progress one', () => {
    const changes = parseList(LIST)!.changes
    expect(pickActive(changes, 'refactor-header-nav')).toBe('refactor-header-nav')
    expect(pickActive(changes, 'no-such-change')).toBe('add-dark-mode-toggle')
    expect(pickActive(changes, null)).toBe('add-dark-mode-toggle')
    expect(pickActive(changes.filter(c => c.status === 'complete'), null)).toBe(null)
  })

  test('nextSteps follows the change state', () => {
    expect(nextSteps(change({}), [{ id: 'proposal', present: true }, { id: 'tasks', present: false }])).toEqual(['continue'])
    expect(nextSteps(change({}), all(true))).toEqual(['apply'])
    expect(nextSteps(change({ completedTasks: 14 }), all(true))).toEqual(['verify', 'archive'])
    expect(nextSteps(change({ completedTasks: 0, totalTasks: 0 }), all(true))).toEqual(['verify', 'archive'])
  })
})

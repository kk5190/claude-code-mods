import { expect, test } from 'claude-code/testing'

// A test run has no one to answer the dialog, so a publish command must be denied.
// The reason varies with the environment (here git may not be reachable), so only the deny is asserted.
test('git push is denied when nobody answers the confirmation', async $ => {
  const result = await $.tool.call({ tool: 'Bash', command: 'git push origin main' } as never)
  expect(result.deny).toBeDefined()
})

test('a command that is not a publish runs without a prompt', async ($, on) => {
  // Stand in for the Bash tool itself, which sits beneath the plugins.
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', exitCode: 0 } }) as never)

  const result = await $.tool.call({ tool: 'Bash', command: 'echo ok' } as never)
  expect(result.deny).toBeUndefined()
})

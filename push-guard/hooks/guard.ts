// Pure logic for the push guard. No engine imports, so it runs under plain tests.

export type Commit = { name: string; email: string; subject: string }

// The author the guard expects on every commit about to be published.
const EXPECTED_AUTHOR = 'kk5190'

// Matches anywhere in the command, so a chained `git add . && git push` is caught too.
// Over-matching a quoted string is harmless: the guard asks instead of running.
const PUBLISH = /\bgit\s+push\b|\bgh\s+pr\s+create\b/

export const isPublishCommand = (command: string): boolean => PUBLISH.test(command)

// Input is `git log --format=%an%x09%ae%x09%s`, one commit per line.
export const parseCommits = (stdout: string): Commit[] =>
  stdout
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => {
      const [name, email, subject] = line.split('\t')
      return { name, email, subject }
    })

const isExpected = ({ name, email }: Commit) =>
  name === EXPECTED_AUTHOR || email.toLowerCase().includes(EXPECTED_AUTHOR)

export const authorWarnings = (commits: Commit[]): string[] =>
  commits.filter(c => !isExpected(c)).map(c => `${c.name} <${c.email}>: ${c.subject}`)

export const summarize = (commits: Commit[], shortstat: string): string => {
  const count = `${commits.length} commit${commits.length === 1 ? '' : 's'}`
  const lines = commits.map(c => `  ${c.subject}`)
  return [count, ...lines, shortstat.trim()].filter(Boolean).join('\n')
}

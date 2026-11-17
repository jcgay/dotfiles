import { expect, test } from 'claude-code/testing'
import { check, expandHome, githubRepo, parseCommit } from './message'

const OK = 'Fix it\n\nBecause.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
const withCloses = (n: string) => OK.replace('Co-Authored', `${n}\nCo-Authored`)

test('parseCommit reads -m, heredoc, -F and skips the rest', () => {
  expect(parseCommit('git status')).toBe(undefined)
  expect(parseCommit('echo "git commit"')).toBe(undefined)
  expect(parseCommit(`git commit -m "a \\"b\\"" -m 'c'`)?.message).toBe('a "b"\n\nc')
  expect(parseCommit(`git add . && git commit -am "x"`)?.message).toBe('x')
  expect(parseCommit(`git commit -m "$(cat <<'EOF'\nSubject\n\nBody\nEOF\n)"`)?.message).toBe('Subject\n\nBody')
  expect(parseCommit(`yadm commit -q -F - <<'EOF'\nS\n\nB\nEOF`)).toEqual({ tool: 'yadm', cd: undefined, message: 'S\n\nB' })
  expect(parseCommit('cd ~/x && git commit -F /tmp/msg')).toEqual({ tool: 'git', cd: '~/x', file: '/tmp/msg' })
  expect(parseCommit('git commit --amend --no-edit')?.message).toBe(undefined)
  expect(parseCommit('git commit --fixup=abc123')?.message).toBe(undefined)
  // A heredoc that writes a file mentioning git commit is not a commit.
  expect(parseCommit(`cat > f <<'EOF'\ngit commit -m "x"\nEOF`)).toBe(undefined)
})

test('parseCommit finds commits behind options, prefixes and later lines', () => {
  expect(parseCommit('git -C ~/dev/repo commit -m "x"')).toEqual({ tool: 'git', cd: '~/dev/repo', message: 'x' })
  expect(parseCommit('git -c user.name=x commit -m "x"')?.message).toBe('x')
  expect(parseCommit('rtk proxy yadm commit -m "x"')?.tool).toBe('yadm')
  expect(parseCommit('git add -A\ngit commit -m "x"')?.message).toBe('x')
  expect(parseCommit('git add . && \\\n  git commit -m "x"')?.message).toBe('x')
})

test('parseCommit reads only the commit segment and its own message', () => {
  expect(parseCommit('git stash push -m "wip" && git commit -m "x"')?.message).toBe('x')
  expect(parseCommit('git commit -F msg && git tag -a v1 -m "release"')).toEqual({ tool: 'git', cd: undefined, file: 'msg' })
  expect(parseCommit(`git commit -F - <<'EOF'\nAbout git commit -m "x"\nEOF`)?.message).toBe('About git commit -m "x"')
  expect(parseCommit('git commit -m wip')?.message).toBe('wip')
  expect(parseCommit('git commit -m"Fix it"')?.message).toBe('Fix it')
  // Shell expansions are unreadable here: no message, so no false refusal.
  expect(parseCommit('git commit -m "$MSG"')?.message).toBe(undefined)
  expect(parseCommit('git commit -m "$(cat /tmp/msg)"')?.message).toBe(undefined)
  expect(parseCommit(`git commit -m 'costs $5'`)?.message).toBe('costs $5')
})

test('check names each broken rule', () => {
  expect(check(OK)).toEqual([])
  expect(check('Fix it')).toHaveLength(1)
  expect(check(OK.replace('Because.', 'Because — reasons.'))).toHaveLength(1)
  expect(check(OK, 54)).toHaveLength(1)
  expect(check(withCloses('Closes #54'), 54)).toEqual([])
  expect(check(withCloses('Closes #12, closes #54'), 54)).toEqual([])
  expect(check(withCloses('Closes #540'), 54)).toHaveLength(1)
  // Co-Authored-By must be the last trailer.
  expect(check(`${OK}\nCloses #54`, 54)).toHaveLength(1)
})

test('githubRepo and expandHome', () => {
  expect(githubRepo('git@github.com:jcgay/dotfiles.git\n')).toBe('jcgay/dotfiles')
  expect(githubRepo('https://github.com/o/r')).toBe('o/r')
  expect(githubRepo('git@gitlab.com:o/r.git')).toBe(undefined)
  expect(expandHome('~/x', '/h')).toBe('/h/x')
  expect(expandHome('~', '/h')).toBe('/h')
  expect(expandHome('a/~b', '/h')).toBe('a/~b')
})

function engine(on: any, pr: { number: number; state: string } | undefined) {
  const seen = { ran: 0, cwd: [] as (string | undefined)[], read: [] as string[] }
  on('process.run', (_: unknown, e: { argv: string[]; init?: { cwd?: string } }) => {
    const [cmd, sub] = e.argv
    if (cmd !== 'printenv') seen.cwd.push(e.init?.cwd)
    const out =
      cmd === 'printenv' ? '/home/me\n'
      : cmd === 'gh' ? (pr ? JSON.stringify(pr) : undefined)
      : sub === 'rev-parse' ? 'feature\n'
      : 'git@github.com:o/r.git\n'
    return { value: { exitCode: out === undefined ? 1 : 0, stdout: out ?? '', stderr: '' } }
  })
  on('fs.read', (_: unknown, e: { path: string }) => { seen.read.push(e.path); return { value: OK } })
  on('tool.call', () => { seen.ran++; return { result: {} } })
  return seen
}

test('a commit missing Closes on a PR branch is denied, a good one runs', async ($, on) => {
  const seen = engine(on, { number: 7, state: 'OPEN' })
  const bad = await $.tool.call({ tool: 'Bash', command: `git commit -m "${OK}"` })
  expect(seen.ran).toBe(0)
  expect(JSON.stringify(bad)).toContain('Closes #7')
  await $.tool.call({ tool: 'Bash', command: `git commit -m "${withCloses('Closes #7')}"` })
  expect(seen.ran).toBe(1)
})

test('no PR, or a closed one, needs no Closes', async ($, on) => {
  const seen = engine(on, { number: 7, state: 'MERGED' })
  await $.tool.call({ tool: 'Bash', command: `git commit -m "${OK}"` })
  expect(seen.ran).toBe(1)
})

test('gh failing skips only the Closes check', async ($, on) => {
  const seen = engine(on, undefined)
  await $.tool.call({ tool: 'Bash', command: `git commit -m "${OK}"` })
  expect(seen.ran).toBe(1)
})

test('a refused message does not wait for gh', async ($, on) => {
  const seen = engine(on, { number: 7, state: 'OPEN' })
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "no trailer"' })
  expect(seen.ran).toBe(0)
  expect(seen.cwd).toEqual([])
})

test('a ~ directory and a relative -F file are resolved from HOME', async ($, on) => {
  const seen = engine(on, undefined)
  await $.tool.call({ tool: 'Bash', command: 'cd ~/repo && git commit -F msg' })
  expect(seen.read).toEqual(['/home/me/repo/msg'])
  expect(seen.cwd[0]).toBe('/home/me/repo')
  expect(seen.ran).toBe(1)
})

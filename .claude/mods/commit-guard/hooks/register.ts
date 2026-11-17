import type { EngineInterface, Register } from 'claude-code'
import { check, expandHome, githubRepo, parseCommit, type Commit } from './message'

// $.process.run has no shell, so `~` is expanded here; read once per load.
let home: Promise<string> | undefined
function homeDir($: EngineInterface): Promise<string> {
  home ??= $.process.run(['printenv', 'HOME']).then(r => r.stdout.trim(), () => '~')
  return home
}

// The open PR of the branch being committed, if any; undefined on any failure.
async function openPr($: EngineInterface, c: Commit, cwd?: string): Promise<number | undefined> {
  const run = (argv: string[]) => $.process.run(argv, cwd ? { cwd } : undefined).catch(() => undefined)
  const [branch, remote] = await Promise.all([
    run([c.tool, 'rev-parse', '--abbrev-ref', 'HEAD']),
    run([c.tool, 'remote', 'get-url', 'origin']),
  ])
  const repo = remote?.exitCode === 0 ? githubRepo(remote.stdout) : undefined
  const name = branch?.exitCode === 0 ? branch.stdout.trim() : ''
  if (!repo || !name || name === 'HEAD') return undefined
  const pr = await run(['gh', 'pr', 'view', name, '-R', repo, '--json', 'number,state'])
  if (pr?.exitCode !== 0) return undefined
  const { number, state } = JSON.parse(pr.stdout)
  return state === 'OPEN' ? number : undefined
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const c = parseCommit(e.command)
    if (!c) return next(e)
    const cwd = c.cd === undefined ? undefined : expandHome(c.cd, await homeDir($))
    let message = c.message
    if (c.file) {
      const file = expandHome(c.file, await homeDir($))
      message = await $.fs.read(cwd && !file.startsWith('/') ? `${cwd}/${file}` : file).catch(() => undefined)
    }
    if (message === undefined) return next(e) // editor, --no-edit, --fixup, $VAR: nothing to read
    // The static rules first: a refused commit does not wait for gh.
    let errors = check(message)
    if (!errors.length) errors = check(message, await openPr($, c, cwd))
    if (!errors.length) return next(e)
    return { deny: `Message de commit refusé (~/.claude/rules/git-commit.md) :\n- ${errors.join('\n- ')}` }
  })
}

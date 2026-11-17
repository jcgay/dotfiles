// Pure parsing and checks, no `$`: tested on their own.

export type Commit = {
  tool: 'git' | 'yadm'
  /** Directory from `git -C X` or a leading `cd X &&`, else undefined (the session's). */
  cd?: string
  /** The message, or a file to read it from; neither when an editor or git writes it, or it cannot be read. */
  message?: string
  file?: string
}

const HEREDOC = /(<<-?\s*(['"]?)(\w+)\2[^\n]*\n)([\s\S]*?)\n([ \t]*\3)(?=\n|\)|$)/g
const WORD = String.raw`(?:"[^"]*"|'[^']*'|\S+)`
// `git` or `yadm` at a segment start, after an optional `rtk [proxy]`, then global options, then `commit`.
const COMMIT = new RegExp(
  String.raw`(?:^|[;&|(\n]|\$\()\s*(?:rtk\s+(?:proxy\s+)?)?(git|yadm)((?:\s+(?:-[Cc]\s+${WORD}|--?[\w-]+(?:=\S+)?))*)\s+commit(?=\s|$)`,
)
const VALUE = String.raw`("(?:[^"\\]|\\.)*"|'[^']*'|[^\s"';&|]+)`

function unquote(s: string): string {
  if (s.startsWith("'")) return s.slice(1, -1)
  if (s.startsWith('"')) return s.slice(1, -1).replace(/\\(["\\$`])/g, '$1')
  return s
}

/** The command up to the first `;`, `&`, `|` or newline outside quotes. */
function segment(s: string): string {
  let quote = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if (quote) {
      if (ch === '\\' && quote === '"') i++
      else if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") quote = ch
    else if (';&|\n'.includes(ch)) return s.slice(0, i)
  }
  return s
}

export function parseCommit(command: string): Commit | undefined {
  // Heredoc bodies are text, not commands: blank them, keep the first for `-F -` and `$(cat <<`.
  let heredoc: string | undefined
  const shell = command
    .replace(HEREDOC, (_all, head: string, _q, _tag, body: string, close: string) => {
      heredoc ??= body
      return head + close
    })
    .replace(/\\\n/g, ' ')
  const m = COMMIT.exec(shell)
  if (!m) return undefined
  const tool = m[1] as 'git' | 'yadm'
  const dashC = new RegExp(String.raw`-C\s+(${WORD})`).exec(m[2] ?? '')?.[1]
  const cd = dashC ?? new RegExp(String.raw`^\s*cd\s+(${WORD})\s*&&`).exec(shell)?.[1]
  const commit: Commit = { tool, cd: cd === undefined ? undefined : unquote(cd) }

  const args = segment(shell.slice(m.index + m[0].length))
  if (/(^|\s)--no-edit(\s|$)/.test(args)) return commit
  const values = [...args.matchAll(new RegExp(String.raw`(?:^|\s)(?:-[a-zA-Z]*m|--message)(?:\s+|=)?${VALUE}`, 'g'))]
  if (values.length) {
    const parts = values.map(v => {
      const raw = v[1]!
      if (raw.startsWith('"$(cat <<')) return heredoc
      // Any other expansion ($VAR, $(cmd)) is only known to the shell: unreadable.
      if (raw.startsWith('"') && /(^|[^\\])\$/.test(raw)) return undefined
      return unquote(raw)
    })
    if (!parts.includes(undefined)) commit.message = parts.join('\n\n')
    return commit
  }
  const file = new RegExp(String.raw`(?:^|\s)(?:-F|--file)(?:\s+|=)?${VALUE}`).exec(args)?.[1]
  if (file === '-') commit.message = heredoc
  else if (file) commit.file = unquote(file)
  return commit
}

/** `~` or `~/…` made absolute; anything else unchanged. */
export function expandHome(path: string, home: string): string {
  return path.replace(/^~(?=\/|$)/, home)
}

/** Reasons the message breaks the rules; empty when it is fine. */
export function check(message: string, pr?: number): string[] {
  const errors: string[] = []
  if (!/(^|\n)Co-Authored-By: Claude [^\n]*<noreply@anthropic\.com>\s*$/.test(message))
    errors.push('le dernier trailer doit être `Co-Authored-By: Claude <modèle> <noreply@anthropic.com>`')
  if (/[\u2013\u2014]/.test(message))
    errors.push('pas de tiret cadratin ni demi-cadratin (— –) : virgule, deux-points, point ou parenthèses')
  if (pr !== undefined && !new RegExp(String.raw`\bcloses #${pr}\b`, 'i').test(message))
    errors.push(`la branche a la PR #${pr} ouverte : ajoute \`Closes #${pr}\` dans le footer`)
  return errors
}

/** `owner/repo` from a GitHub remote URL, else undefined. */
export function githubRepo(url: string): string | undefined {
  return /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(url.trim())?.[1]
}

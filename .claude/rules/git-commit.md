# Git commit messages

Applies whenever you write a commit message (or a PR description).

Commit at the end of each task, on the current branch, without asking me —
including on `master`/`main`. Push still only when I ask.

## Subject

- English, imperative mood, no trailing period: `Fix unstable Epp choice in EPP alert couples`.
- ~50 chars, never more than 72. Name the change, not the file touched.
- No `conventional commits` prefix (`feat:`, `fix:`, `chore:`) unless the repo's
  existing history already uses one — check `git log --oneline -20` first.
- Same for a ticket prefix (`RUNBO-1534: ...`): follow the repo, don't invent it.

## Body

- Mandatory for anything but a trivial one-liner. Blank line after the subject,
  wrapped at 72 columns.
- Explain **why**: the constraint, the failure mode, the option not taken, the
  external context that cannot be guessed from the code alone.
- For a bugfix, name the root cause — what was wrong and why — not the sequence
  of edits that fixes it.
- Prose, not a bullet-list restating each hunk. Bullets only for a genuine
  enumeration.
- Keep it readable: a handful of lines most of the time. Go longer only when the
  change actually needs it — don't tell your life story by default.
- Link public sources outside the repo when they exist: vendor documentation,
  spec, standard, upstream issue.

## Footer

- `Closes #123` for a GitHub issue, `See MERLIN-2303` for a Jira reference.
- Last trailer of every commit message:
  `Co-Authored-By: Claude <MODEL_NAME> (<CONTEXT_SIZE>) <noreply@anthropic.com>`
  where `<MODEL_NAME>` and `<CONTEXT_SIZE>` are the *current* session's model, not
  a hardcoded one — e.g. `Claude Opus 5 (1M context)`, `Claude Sonnet 5 (200k context)`.
  Take the exact string from the harness instructions of the running session; if
  the harness gives no context size, drop the parentheses entirely.
- Last line of every PR body:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

## Never

- Don't push unless asked.
- Don't walk through the implementation: no step-by-step of the edits, no
  trivial details the diff already shows.
- Don't describe the session ("as requested", "per review feedback") — the
  message must still make sense in two years, read alone.
- Don't pad with a summary of the obvious ("update tests", "refactor code").

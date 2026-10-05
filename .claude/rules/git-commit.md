# Git commit messages

Applies whenever you write a commit message (or a PR description).

Commit at the end of each task, on the current branch, without asking me —
including on `master`/`main`. Push still only when I ask.

## Review feedback

Changes asked for in a code review go in `git commit --fixup=<sha>`
commits, one per commit being corrected (find it with `git blame` /
`git log -L`), never in a new standalone commit. Don't autosquash them:
I run `git rebase -i --autosquash` myself.

## Pull request

Once the branch has an open pull request (`gh pr view --json number`), every
new commit carries `Closes #<PR>` in its footer.

When a pull request has just been opened, by `gh pr create` or because I say
so, the commits made before it get the trailer too:

1. List `git log <base>..HEAD` and show it to me; I may drop some.
2. For each remaining commit, `git commit --fixup=amend:<sha>` with the
   original message plus the trailer. Skip the ones that already have it.
3. Don't autosquash, don't push: same as review fixups.

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
- A bugfix also gets a "To reproduce" paragraph: numbered steps someone without
  the session's context can follow on the unfixed code.
  - Starting point: version, branch or commit, environment, the configuration
    or data it needs.
  - Exact actions: commands, requests (`curl ...`), input identifiers, UI clicks.
  - Observed result, with the exact error message or an excerpt of it, then
    the expected result.
  - Not reproducible by hand (race, production data)? Say why, and name the
    test that reproduces it.
  This paragraph is the one part allowed past "a handful of lines".
- Prose, not a bullet-list restating each hunk. Bullets only for a genuine
  enumeration.
- Keep it readable: a handful of lines most of the time. Go longer only when the
  change actually needs it — don't tell your life story by default.
- Humanize your final message using /humanizer skill
- Link public sources outside the repo when they exist: vendor documentation,
  spec, standard, upstream issue.

## Footer

- `Closes #123` for a GitHub issue or pull request, `See MERLIN-2303` for a Jira
  reference. Several on one line, the keyword repeated before each number:
  `Closes #456, closes #1234`; a bare `#1234` after a comma links nothing
  ([GitHub](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)).
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

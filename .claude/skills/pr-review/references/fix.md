# Fix the findings (`--fix`)

Runs after the review is posted (SKILL.md section 5), or after the merge in
no-PR mode. `<base-sha>`, `<head>`, `headRefName`, `headRefOid` and
`comment_id` are the values of SKILL.md sections 1 to 5.

- Allowed only when all hold: the current directory is the PR's repository,
  `isCrossRepository` is false (a fork's branch is not pushed to `origin`),
  `git branch --show-current` = `headRefName` or HEAD is detached (the PR
  watch's worktree; the push below names the branch), and `git rev-parse HEAD` =
  `headRefOid` (no local commit that is not in the PR). In no-PR mode: the
  current branch; a PR whose diff GitHub refused (HTTP 406) keeps the PR-mode
  checks and push, without thread replies. Otherwise: the review is posted, then say why `--fix`
  cannot run, and stop.
- Never stage a file you did not change for a finding: `git add <path>…`
  by name, never `git add -A` or `.`; files already modified before the run
  stay out of the fixups.
- Invoke `superpowers:receiving-code-review` before touching any finding.
  Verify each finding against the code. Fix every valid `bloquant` and
  `important`, and the valid `mineur` ones worth it. A rejected finding gets
  a one-sentence technical reason.
- Run the checks the repository documents (AGENTS.md, CLAUDE.md) on the
  modules you touched. A check that fails because of your fix: fix it or
  revert that fix and mark the finding "laissée". A failure unrelated to the
  change (Docker image not pulled, network): name it in the report and go on,
  once the tests of the touched classes are green in their JUnit XML.
- One `git commit --fixup=<sha>` per corrected commit, following the user's
  commit rules; never autosquash. git refuses `-F` with `--fixup`: pass the
  body with `-m "$(cat <file>)"`, it goes under the `fixup!` subject. The
  corrected commit:
  `git blame -L <line>,<line> <head> -- <path>` when it is in
  `<base-sha>..HEAD`, else the latest commit of that range touching the file.
  Never find it by its title (`grep`, `git log --grep`): the `fixup!` and
  `amend!` commits carry the same title and come first, which gives
  `fixup! fixup!`.
  A fix to an older commit that relies on code a later commit of the
  branch adds goes in that later commit's fixup instead: applied to the
  older one, the autosquash leaves an intermediate commit that does not
  work and the rebase conflicts. Say so in the fixup's body.
  A finding that a commit message claims something false: `git commit
  --fixup=amend:<sha>` carries both the code fix and the corrected message.
  `git rebase --autosquash` keeps only the original message: when a fixup's
  body explains a behaviour change, use `git commit --fixup=amend:<sha>` with
  the merged message (the original one plus that explanation) instead.
- PR mode (and a PR whose diff GitHub refused), push: `git fetch origin <headRefName>`, then
  `git merge-base --is-ancestor origin/<headRefName> HEAD` must succeed, then
  `git push origin HEAD:refs/heads/<headRefName>`. Never force. Remote moved
  or push rejected: stop, post no reply, say the fixups are local.
- After the push, reply in each thread that has a `comment_id`. Write each
  reply to a literal scratchpad file (apostrophes break inline quoting), for
  example:

  ```
  Corrigé dans <short-sha> : <what changed, one sentence>.

  🤖 Jean-Claude
  ```

  or `Non corrigé : <reason>.` with the same signature. Send it with
  `gh api repos/<owner>/<repo>/pulls/<N>/comments/<comment_id>/replies -F body=@<literal path>`.
  Findings in the body only get no reply.

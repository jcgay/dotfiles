# `Closes #<PR>` on the commits made before the pull request

Read from `~/.claude/rules/git-commit.md`, before opening a pull request and
when one has just been opened another way. Once a branch has an open pull
request, every commit carries `Closes #<PR>` in its footer; these steps give
it to the commits that came first.

When you open the pull request yourself, put the trailer on before the first
push, by guessing the number GitHub will give it:

1. Issues, pull requests and discussions share one sequence: the next number
   is the highest of `gh api 'repos/{owner}/{repo}/issues?state=all&sort=created&direction=desc&per_page=1' --jq '.[0].number'`
   (it lists pull requests too) and `gh api graphql -f query='{repository(owner:"<owner>",name:"<repo>"){discussions(last:1){nodes{number}}}}'`,
   plus one.
2. Only if none of the branch's commits is on the remote yet: add
   `Closes #<guess>` to every commit of `<base>..HEAD` that lacks it, just
   before `Co-Authored-By` (a rebase with `--no-update-refs`, local commits
   only). Then push and `gh pr create` right away, to shrink the race.
3. Check the number `gh pr create` printed. Someone may have opened an issue
   in between: on a mismatch, fix it with the fixup procedure below, with the
   real number, and tell me. Name the commits that got the trailer in your
   report, so I can drop it from one.

When a pull request has just been opened another way, because I say so or
the guess was wrong, the commits made before it get the trailer too:

1. List `git log <base>..HEAD` and show it to me; I may drop some.
2. For each remaining commit, `git commit --fixup=amend:<sha>` with the
   original message plus the trailer. Skip the ones that already have it.
3. Don't autosquash: same as review fixups.

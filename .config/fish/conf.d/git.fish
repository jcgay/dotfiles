# Override git to force English output — must use `command git` to avoid infinite recursion
function git --wraps=git --description 'git with LANG=en_US.UTF-8'
    LANG=en_US.UTF-8 command git $argv
end

# abbr instead of alias: expands in-place so the real command lands in history
abbr -a g git
abbr -a gc 'git commit -v'
abbr -a gco 'git checkout'
abbr -a gcp 'git cherry-pick'
abbr -a gst 'git status'

alias pgr "parallel-git-repo"

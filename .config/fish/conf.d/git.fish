# Override git to force English output — must use `command git` to avoid infinite recursion
function git --wraps=git --description 'git with LANG=en_US.UTF-8'
    LANG=en_US.UTF-8 command git $argv
end

alias g "git"
alias gc "git commit -v"
alias gco "git checkout"
alias gcp "git cherry-pick"
alias gst "git status"
alias pgr "parallel-git-repo"

completion='$(brew --prefix)/etc/bash_completion.d/tig-completion.bash'

if test -f $completion
then
  source $completion
fi

# To speedup git completion: https://stackoverflow.com/questions/9810327/zsh-auto-completion-for-git-takes-significant-amount-of-time-can-i-turn-it-off/9810485#9810485
__git_files () { 
    _wanted files expl 'local files' _files     
}

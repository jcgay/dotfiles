completion='$(brew --prefix)/etc/bash_completion.d/tig-completion.bash'

if test -f $completion
then
  source $completion
fi


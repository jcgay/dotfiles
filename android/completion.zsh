completion='$(brew --prefix)/etc/bash_completion.d/adb-completion.bash'

if test -f $completion
then
  source $completion
fi

export PATH="./bin:/usr/local/bin:/usr/local/sbin:$DOTFILES/bin:$PATH"
export EDITOR="mate -w"

export HISTCONTROL=erasedups
# Make some commands not show up in history
export HISTIGNORE="ls:cd:cd -:pwd:exit:date:* --help"

# Don’t clear the screen after quitting a manual page
export MANPAGER="less -X"

# Always enable colored `grep` output
export GREP_OPTIONS="--color=auto"

# jEnv configuration.
export PATH="$HOME/.jenv/bin:$PATH"
eval "$(jenv init -)"

jenv enable-plugin maven > /dev/null 2>&1
jenv enable-plugin gradle > /dev/null 2>&1
jenv enable-plugin groovy > /dev/null 2>&1
jenv enable-plugin sbt > /dev/null 2>&1
jenv enable-plugin scala > /dev/null 2>&1

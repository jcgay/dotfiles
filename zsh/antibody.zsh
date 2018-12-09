source <(antibody init)

# where is antibody keeping its stuff?
ANTIBODY_HOME="$(antibody home)"
# tell omz where it lives
export ZSH="$ANTIBODY_HOME"/https-COLON--SLASH--SLASH-github.com-SLASH-robbyrussell-SLASH-oh-my-zsh

antibody bundle < ~/.zsh_plugins.txt

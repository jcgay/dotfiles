fpath=($DOTFILES/functions $fpath)

autoload -U $DOTFILES/functions/*(:t)

# Antigen
source "$HOME/.dotfiles/antigen/antigen.zsh"

# Load the oh-my-zsh's library.
antigen use oh-my-zsh
# Plugins
antigen-bundles <<EOBUNDLES

git
brew
mvn
textmate
extract
gitignore
gradle
history
sbt
scala
z
arialdomartini/oh-my-git
zsh-users/zsh-history-substring-search
zsh-users/zsh-syntax-highlighting

EOBUNDLES

antigen theme arialdomartini/oh-my-git-themes arialdo-pathinline

antigen-apply

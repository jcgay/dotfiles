# Antigen
source "$HOME/.dotfiles/antigen/antigen.zsh"

# Load the oh-my-zsh's library.
antigen use oh-my-zsh
# Plugins
antigen-bundles <<EOBUNDLES

git
brew
docker
mvn
textmate
extract
gitignore
gradle
history
sbt
scala
vagrant
boot2docker
rupa/z
arialdomartini/oh-my-git
Tarrasch/zsh-autoenv
zsh-users/zsh-history-substring-search
zsh-users/zsh-syntax-highlighting

EOBUNDLES

antigen theme arialdomartini/oh-my-git-themes oppa-lana-style

antigen-apply

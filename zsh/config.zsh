fpath=($DOTFILES/functions $fpath)

autoload -U $DOTFILES/functions/*(:t)

# Path to your oh-my-zsh configuration.
ZSH=$HOME/.oh-my-zsh

# Set name of the theme to load.
# Look in ~/.oh-my-zsh/themes/
# Optionally, if you set this to "random", it'll load a random theme each
# time that oh-my-zsh is loaded.
ZSH_THEME="robbyrussell"

# Which plugins would you like to load? (plugins can be found in ~/.oh-my-zsh/plugins/*)
# Custom plugins may be added to ~/.oh-my-zsh/custom/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
plugins=(git brew mvn textmate extract gitignore gradle history sbt scala z zsh-syntax-highlighting)

source $ZSH/oh-my-zsh.sh

# Antigen
source "$HOME/.antigen/antigen.zsh"

antigen-use oh-my-zsh
antigen-bundle arialdomartini/oh-my-git
antigen theme arialdomartini/oh-my-git-themes arialdo-pathinline

antigen-apply

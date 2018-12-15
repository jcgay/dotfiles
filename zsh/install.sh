#!/bin/sh

echo 'Installing zsh...'

brew install zsh
brew install getantibody/tap/antibody

chsh -s /bin/zsh

# Install fonts for powerlevel9k theme
brew cask install font-hack-nerd-font

exit 0
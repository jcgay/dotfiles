#!/bin/sh

echo 'Installing zsh...'

brew install zsh antidode

chsh -s /bin/zsh

# Install fonts for powerlevel9k theme
brew install --cask font-hack-nerd-font

exit 0
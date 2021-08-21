#!/bin/sh

echo 'Installing Maven...'

brew install maven mvndaemon/homebrew-mvnd/mvnd

# install maven-color, maven-notifier and maven-profiler
brew unlink maven && brew install maven-deluxe
brew unlink mvnd && brew install mvnd-deluxe

exit 0

#!/bin/sh

echo 'Installing Maven...'

brew install maven maven@3.1 maven@3.2 maven@3.3

# install maven-color, maven-notifier and maven-profiler
brew unlink maven && brew install maven-deluxe

exit 0

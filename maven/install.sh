#!/bin/sh

echo 'Installing Maven...'

brew install maven

# install maven-color, maven-notifier and maven-profiler
brew unlink maven && brew install maven-deluxe

exit 0

#!/bin/sh

brew install maven maven2 maven30 maven31 maven32

# install maven-color, maven-notifier and maven-profiler
brew unlink maven && brew install maven-deluxe

exit 0

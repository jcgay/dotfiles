#!/bin/sh

brew cask install java # Needed by gradle
brew install groovy --with-invokedynamic
brew install gradle

exit 0
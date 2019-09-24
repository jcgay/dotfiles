#!/bin/sh

echo 'Installing from cask...'

sudo xcodebuild -license accept

brew bundle --file=cask/Brewfile

exit 0

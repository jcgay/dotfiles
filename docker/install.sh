#!/bin/sh

echo 'Installing Docker...'

brew cask install docker
brew cask install kitematic
brew install ctop
brew install dive
brew install moul/moul/docker-diff

exit 0
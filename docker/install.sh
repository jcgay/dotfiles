#!/bin/sh

echo 'Installing Docker...'

brew install --cask docker
brew install --cask kitematic
brew install ctop
brew install wagoodman/dive/dive
brew install moul/moul/docker-diff

exit 0
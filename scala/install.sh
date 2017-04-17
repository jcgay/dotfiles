#!/bin/sh

echo 'Installing Scala...'

brew install scala --with-docs
brew install scala@2.10
brew install sbt
brew install typesafe-activator

exit 0
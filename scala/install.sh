#!/bin/sh

brew install scala --with-docs
brew install sbt

mkdir -p ~/.sbt/0.13/plugins/
echo 'addSbtPlugin("com.github.mpeltonen" % "sbt-idea" % "1.5.1")' >> ~/.sbt/0.13/plugins/build.sbt

exit 0
#!/bin/sh

echo 'Installing SDKMAN!...'
curl -s "https://get.sdkman.io" | bash
source "$HOME/.sdkman/bin/sdkman-init.sh"

echo 'Installing Java...'
yes | sdk install java 6u65
yes | sdk install java 7u79
yes | sdk install java 8u131
sdk default java 8u131

echo 'Installing Groovy...'
sdk install groovy
sdk default groovy

echo 'Installing Gradle'
sdk install gradle
sdk default gradle

echo 'Installing Scala...'
sdk install scala
sdk default scala
sdk install sbt
sdk default sbt
sdk install activator
sdk default activator

echo 'Installing Kotlin...'
sdk install kotlin
sdk default kotlin

echo 'Installing Vert.x...'
sdk install vertx
sdk default vertx

brew install 'tomcat'
brew install 'tomcat@6'
brew install 'sonarqube'

exit 0
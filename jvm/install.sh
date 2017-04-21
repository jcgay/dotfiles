#!/bin/sh

echo 'Installing SDKMAN!...'
curl -s "https://get.sdkman.io" | bash
source "$HOME/.sdkman/bin/sdkman-init.sh"

echo 'Installing Java...'
wget -P $TMPDIR https://support.apple.com/downloads/DL1572/fr_FR/javaforosx.dmg && open $TMPDIR/javaforosx.dmg
yes | sdk install java 7.0.181-zulu
yes | sdk install java 8.0.181-zulu
yes | sdk install java 11.0.0-open
sdk default java 11.0.0-open

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
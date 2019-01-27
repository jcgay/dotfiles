#!/bin/sh

echo 'Installing SDKMAN!...'
curl -s "https://get.sdkman.io" | bash
source "$HOME/.sdkman/bin/sdkman-init.sh"

echo 'Installing Java...'
wget -P $TMPDIR https://support.apple.com/downloads/DL1572/fr_FR/javaforosx.dmg && open $TMPDIR/javaforosx.dmg
yes | sdk install java 8.0.201-zulu
yes | sdk install java 11.0.2-open
sdk default java 11.0.2-open

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

echo 'Installing Kotlin...'
sdk install kotlin
sdk default kotlin

brew install jenv

echo 'Adding default Java version in jEnv'
jenv add $(/usr/libexec/java_home)

exit 0
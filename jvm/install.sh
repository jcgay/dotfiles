#!/bin/sh

echo 'Installing SDKMAN!...'
curl -s "https://get.sdkman.io" | bash
source "$HOME/.sdkman/bin/sdkman-init.sh"

echo 'Installing Java...'
wget -P $TMPDIR https://support.apple.com/downloads/DL1572/fr_FR/javaforosx.dmg && open $TMPDIR/javaforosx.dmg
yes | sdk install java 8.0.212.hs-adpt
yes | sdk install java 11.0.3.hs-adpt
sdk default java 11.0.3.hs-adpt

echo 'Installing Groovy...'
sdk install groovy
sdk default groovy

echo 'Installing Gradle'
sdk install gradle
sdk default gradle
brew install gradle-completion

echo 'Installing Scala...'
sdk install scala
sdk default scala
sdk install sbt
sdk default sbt

echo 'Installing Kotlin...'
sdk install kotlin
sdk default kotlin

echo 'Installing j’bang'
sdk install jbang

brew install jenv
mkdir -p ~/.jenv/versions

echo 'Adding default Java version in jEnv'
jenv add $(/usr/libexec/java_home)
jenv add ~/.sdkman/candidates/java/8.0.212.hs-adpt
jenv add ~/.sdkman/candidates/java/11.0.3.hs-adpt
jenv enable-plugin ant
jenv enable-plugin export
jenv enable-plugin gradle
jenv enable-plugin groovy
jenv enable-plugin maven
jenv enable-plugin sbt
jenv enable-plugin scala
jenv enable-plugin springboot

exit 0
#!/bin/sh

brew install maven homebrew/versions/maven30
brew link --overwrite maven30

echo "\033[0;34mInstalling maven-color...\033[0m"
MAVEN_COLOR=~/.m2/maven-color/3.0.x
mkdir -p $MAVEN_COLOR
wget -P $MAVEN_COLOR http://dl.bintray.com/jcgay/maven/com/github/jcgay/maven/color/maven-color-agent/0.4/maven-color-agent-0.4.jar
wget -P $MAVEN_COLOR http://dl.bintray.com/jcgay/maven/com/github/jcgay/maven/color/maven-color-logger/0.4/maven-color-logger-0.4.jar
(cd $MAVEN_COLOR && ln -s $MAVEN_COLOR/maven-color-logger-0.4.jar maven-color-logger.jar)
(cd $MAVEN_COLOR && ln -s $MAVEN_COLOR/maven-color-agent-0.4.jar maven-color-agent.jar)
(cd $(brew --prefix)/Cellar/maven30/3.0.5/libexec/lib/ext && cp $MAVEN_COLOR/maven-color-logger.jar maven-color-logger.jar)

echo "\033[0;34mInstalling maven-notifier...\033[0m"
MAVEN_NOTIFIER=$(brew --prefix)/Cellar/maven30/3.0.5/libexec/lib/ext
wget -P $MAVEN_NOTIFIER http://dl.bintray.com/jcgay/maven/com/github/jcgay/maven/maven-notifier/0.7.1/maven-notifier-0.7.1.zip
(cd $MAVEN_NOTIFIER && unzip maven-notifier-0.7.1.zip && rm maven-notifier-0.7.1.zip)

exit 0

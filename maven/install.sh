#!/bin/sh

#brew install maven homebrew/versions/maven30
#brew link --overwrite maven30

echo "\033[0;34mInstalling maven-color...\033[0m"
MAVEN_COLOR=~/.m2/maven-color/3.0.x
mkdir -p $MAVEN_COLOR
wget -P $MAVEN_COLOR http://dl.bintray.com/jcgay/maven/com/github/jcgay/maven/color/maven-color-agent/0.3/maven-color-agent-0.3.jar
wget -P $MAVEN_COLOR http://dl.bintray.com/jcgay/maven/com/github/jcgay/maven/color/maven-color-logger/0.3/maven-color-logger-0.3.jar
(cd $MAVEN_COLOR && ln -s $MAVEN_COLOR/maven-color-logger-0.3.jar maven-color-logger.jar)
(cd $(brew --prefix)/Cellar/maven30/3.0.5/libexec/lib/ext && ln -s $MAVEN_COLOR/maven-color-logger.jar)

exit 0

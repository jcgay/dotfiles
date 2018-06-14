#!/bin/sh

echo 'Installing Java...'

echo "\033[0;34mCloning jEnv...\033[0m"
hash git >/dev/null && /usr/bin/env git clone https://github.com/gcuisinier/jenv.git ~/.jenv || {
  echo "git not installed"
  exit
}

wget -P $TMPDIR https://support.apple.com/downloads/DL1572/fr_FR/javaforosx.dmg
open $TMPDIR/javaforosx.dmg

wget -P $TMPDIR --no-check-certificate --no-cookies --header "Cookie: oraclelicense=accept-securebackup-cookie" "http://download.oracle.com/otn/java/jdk/7u80-b15/jdk-7u80-macosx-x64.dmg"
open $TMPDIR/jdk-7u80-macosx-x64.dmg

wget -P $TMPDIR --no-check-certificate --no-cookies --header "Cookie: oraclelicense=accept-securebackup-cookie" "http://download.oracle.com/otn-pub/java/jdk/8u144-b01/090f390dda5b47b9b721c7dfaa008135/jdk-8u144-macosx-x64.dmg"
open $TMPDIR/jdk-8u144-macosx-x64.dmg

exit 0
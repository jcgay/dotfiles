#!/bin/sh

echo "\033[0;34mCloning jEnv...\033[0m"
hash git >/dev/null && /usr/bin/env git clone https://github.com/gcuisinier/jenv.git ~/.jenv || {
  echo "git not installed"
  exit
}

wget -P $TMPDIR https://support.apple.com/downloads/DL1572/fr_FR/javaforosx.dmg
open $TMPDIR/javaforosx.dmg

wget -P $TMPDIR --no-check-certificate --no-cookies --header "Cookie: oraclelicense=accept-securebackup-cookie" "http://download.oracle.com/otn-pub/java/jdk/7u79-b15/jdk-7u79-macosx-x64.dmg"
open $TMPDIR/jdk-7u79-macosx-x64.dmg

wget -P $TMPDIR --no-check-certificate --no-cookies --header "Cookie: oraclelicense=accept-securebackup-cookie" "http://download.oracle.com/otn-pub/java/jdk/8u91-b14/jdk-8u91-macosx-x64.dmg"
open $TMPDIR/jdk-8u91-macosx-x64.dmg

exit 0
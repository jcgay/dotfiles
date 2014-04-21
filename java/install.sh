#!/bin/sh

echo "\033[0;34mCloning jEnv...\033[0m"
hash git >/dev/null && /usr/bin/env git clone https://github.com/gcuisinier/jenv.git ~/.jenv || {
  echo "git not installed"
  exit
}

wget -P $TMPDIR http://support.apple.com/downloads/DL1572/en_US/JavaForOSX2013-05.dmg
open $TMPDIR/JavaForOSX2013-05.dmg

wget -P $TMPDIR --no-check-certificate --no-cookies --header "Cookie: oraclelicense=accept-securebackup-cookie" "http://download.oracle.com/otn-pub/java/jdk/7u55-b13/jdk-7u55-macosx-x64.dmg"
open $TMPDIR/jdk-7u55-macosx-x64.dmg

wget -P $TMPDIR --no-check-certificate --no-cookies --header "Cookie: oraclelicense=accept-securebackup-cookie" "http://download.oracle.com/otn-pub/java/jdk/8u5-b13/jdk-8u5-macosx-x64.dmg"
open $TMPDIR/jdk-8u5-macosx-x64.dmg

exit 0
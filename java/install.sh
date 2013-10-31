#!/bin/sh

echo "\033[0;34mCloning jEnv...\033[0m"
hash git >/dev/null && /usr/bin/env git clone https://github.com/gcuisinier/jenv.git ~/.jenv || {
  echo "git not installed"
  exit
}

wget -P $TMPDIR --no-cookies --header "Cookie: gpw_e24=http%3A%2F%2Fwww.oracle.com" "http://download.oracle.com/otn-pub/java/jdk/7u45-b18/jdk-7u45-macosx-x64.dmg"
open $TMPDIR/jdk-7u45-macosx-x64.dmg

exit 0
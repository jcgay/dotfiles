#!/bin/sh

wget -P $TMPDIR --no-cookies --header "Cookie: gpw_e24=http%3A%2F%2Fwww.oracle.com" "http://download.oracle.com/otn-pub/java/jdk/7u45-b18/jdk-7u45-macosx-x64.dmg"
open $TMPDIR/jdk-7u45-macosx-x64.dmg

exit 0
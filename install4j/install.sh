#!/bin/sh

wget -P $TMPDIR http://download-keycdn.ej-technologies.com/install4j/install4j_macos_java7_5_1_15_with_jre.dmg
open $TMPDIR/install4j_macos_java7_5_1_15_with_jre.dmg

wget -P $TMPDIR https://download-keycdn.ej-technologies.com/install4j/install4j_macos_7_0_9.dmg
open $TMPDIR/install4j_macos_7_0_9.dmg

exit 0

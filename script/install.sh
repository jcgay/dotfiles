#!/usr/bin/env bash
#
# Run all dotfiles installers.

set -e

# If we're on a Mac, let's install and setup homebrew.
if [ "$(uname -s)" == "Darwin" ]
then
	if test ! $(which brew)
	then
		echo "  Installing Homebrew for you."
		/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" > /tmp/homebrew-install.log
	fi
    brew tap Homebrew/bundle
    brew tap homebrew/cask-versions
    brew tap jcgay/jcgay
    brew tap homebrew/cask-fonts
fi

cd "$(dirname $0)"/..

# find the installers and run them iteratively
# find . -name install.sh -not -path "*/script/*" | while read installer ; do sh -c "${installer}" ; done
# It's easier to run install script by hand to handle dependencies
./zsh/install.sh
./system/install.sh
./git/install.sh
./brew/install.sh
./cask/install.sh
./appstore/install.sh
./jvm/install.sh
./mackup/install.sh
./databases/install.sh
./docker/install.sh
./golang/install.sh
./maven/install.sh
./install4j/install.sh

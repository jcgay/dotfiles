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
		/usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)" > /tmp/homebrew-install.log
	fi
    brew tap Homebrew/bundle
	brew tap caskroom/cask
    brew tap caskroom/versions
    brew tap jcgay/jcgay
    brew tap caskroom/fonts
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
./python/install.sh
./golang/install.sh
./maven/install.sh
./osx/install.sh

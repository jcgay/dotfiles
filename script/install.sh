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
		ruby -e "$(curl -fsSL https://raw.github.com/mxcl/homebrew/go)" > /tmp/homebrew-install.log
	fi
	brew tap phinze/homebrew-cask
	brew install brew-cask
fi

cd "$(dirname $0)"/..

# find the installers and run them iteratively
find . -name install.sh | while read installer ; do sh -c "${installer}" ; done
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
		ruby -e "$(curl -fsSL https://raw.github.com/Homebrew/homebrew/go/install)" > /tmp/homebrew-install.log
	fi
    brew tap Homebrew/bundle
	brew tap caskroom/cask
	brew install brew-cask
    brew tap caskroom/versions
    brew tap jcgay/jcgay
    brew tap homebrew/dupes
    brew tap caskroom/fonts
fi

cd "$(dirname $0)"/..

# find the installers and run them iteratively
find . -name install.sh -not -path "*/script/*" | while read installer ; do sh -c "${installer}" ; done

# Configure hostname (http://biomedicalontologies.com/2012/11/14/fixing-java-net-local-host-name-unknown-error-on-mac-os-x/)
scutil --set HostName "localhost"

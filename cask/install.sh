#!/bin/sh

function installcask() {
	brew cask install "${@}" 2> /dev/null
}

installcask alfred
installcask calibre
installcask chromium
installcask dropbox
installcask filezilla
installcask firefox
installcask gimp
installcask google-chrome
installcask google-hangouts
installcask intellij-idea
installcask iterm2
installcask lastpass
installcask mou
installcask p4merge
installcask steam
installcask textmate
installcask the-unarchiver
installcask virtualbox
installcask virtualbox-extension-pack
installcask vagrant
installcask vagrant-manager
installcask vlc
installcask libre-office
installcask music-manager
installcask android-file-transfer
installcask nvalt
installcask spotify
installcask disk-inventory-x
installcask yujitach-menumeters
installcask qlcolorcode
installcask qlstephen
installcask qlmarkdown
installcask quicklook-json
installcask qlprettypatch
installcask quicklook-csv
installcask betterzipql
installcask qlimagesize
installcask webpquicklook
installcask suspicious-package
installcask provisionql
installcask retinizer
installcask retinacapture
installcask cheatsheet
installcask caffeine
installcask zipeg
installcask acorn
installcask atom
installcask bitbar
installcask garmin-express
installcask imageoptim
installcask visual-studio-code

exit 0

#!/bin/sh

echo 'Installing from the App Store...'

brew install mas

mas install 497799835 # Xcode
mas install 409789998 # Twitter
mas install 467939042 # Growl
mas install 948415170 # Pushbullet
mas install 715768417 # Microsoft Remote Desktop
mas install 890031187 # Marked 2
mas install 557168941 # Tweetbot
mas install 926036361 # LastPass

sudo xcodebuild -license accept

exit 0

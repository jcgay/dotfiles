#!/bin/bash

GITHUB_USERNAME="jcgay"
set -euo pipefail

echo "Xcode Command Line Tools"
if xcode-select -p &>/dev/null; then
    echo "Xcode CLI tools already installed"
else
    xcode-select --install
    until xcode-select -p &>/dev/null; do sleep 5; done
    echo "Xcode CLI tools installed"
fi

sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply $GITHUB_USERNAME --branch chezmoi

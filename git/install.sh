#!/bin/sh

echo 'Installing Git...'

brew install git tig hub gh diff-so-fancy git-lfs git-absorb
git lfs install

exit 0

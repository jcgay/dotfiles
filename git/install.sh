#!/bin/sh

echo 'Installing Git...'

brew install git tig hub diff-so-fancy git-lfs
git lfs install

exit 0
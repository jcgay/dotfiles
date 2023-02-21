#!/bin/sh

echo 'Installing Git...'

brew install git tig hub gh diff-so-fancy git-lfs
git lfs install

exit 0
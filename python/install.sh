brew install python
pip install virtualenv

## Install Pelican
mkdir -p ~/virtualenvs/pelican
virtualenv ~/virtualenvs/pelican
cd ~/virtualenvs/pelican
. bin/activate
pip install pelican
pip install Markdown
pip install beautifulsoup4
pip install typogrify
pip install webassets
pip install cssmin

exit 0
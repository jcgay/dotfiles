#!/bin/sh

brew install zsh

#oh-my-zsh
curl -L https://github.com/robbyrussell/oh-my-zsh/raw/master/tools/install.sh | sh

#zsh-syntax-highlighting
echo "\033[0;34mCloning zsh-syntax-highlighting...\033[0m"
hash git >/dev/null && /usr/bin/env git clone git://github.com/zsh-users/zsh-syntax-highlighting.git ~/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting || {
  echo "git not installed"
  exit
}

echo "\033[0;34mCloning antigen...\033[0m"
hash git >/dev/null && /usr/bin/env git clone https://github.com/zsh-users/antigen.git ~/.antigen || {
  echo "git not installed"
  exit
}

exit 0
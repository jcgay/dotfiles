# PATH
fish_add_path $HOME/.local/bin
fish_add_path /usr/local/bin
fish_add_path /usr/local/sbin
fish_add_path $HOME/Applications/happy-release/bin
fish_add_path $HOME/.local/share/sonarqube-cli/bin

# Editor
set -gx EDITOR micro

# History
set -gx HISTCONTROL erasedups
set -gx HISTIGNORE "ls:cd:cd -:pwd:exit:date:* --help"

# Pager — keep -X for consistency (don't clear screen after man)
set -gx MANPAGER "less -X"

# Homebrew cask
set -gx HOMEBREW_CASK_OPTS "--appdir=/Applications"

# GPG agent — refresh TTY so signing works in interactive sessions
if status is-interactive
    gpg-connect-agent updatestartuptty /bye >/dev/null 2>&1
end

# GRC — colorize unix tools (check for fish support file)
if command -q grc; and command -q brew
    set -l grc_fish (brew --prefix)/etc/grc.fish
    if test -f $grc_fish
        source $grc_fish
    end
end

# SSH public key to clipboard
alias pubkey "more ~/.ssh/id_rsa.pub | pbcopy; and echo '=> Public key copied to pasteboard.'"

# Network
alias ip "dig +short myip.opendns.com @resolver1.opendns.com"
alias whois "whois -h whois-servers.net"

# Checksums (macOS fallbacks)
if not command -q md5sum
    alias md5sum "md5"
end
if not command -q sha1sum
    alias sha1sum "shasum"
end
if not command -q sha256sum
    alias sha256sum "shasum -a 256"
end

# Finder
alias cleanup "find . -type f -name '*.DS_Store' -ls -delete"
alias show "defaults write com.apple.finder AppleShowAllFiles -bool true; and killall Finder"
alias hide "defaults write com.apple.finder AppleShowAllFiles -bool false; and killall Finder"

# Homebrew cask list
alias casks "brew list --cask"

# Dev scaffolding
alias mkpjava "mkdir -p src/{main,test}/{java,resources}"

# Tree
alias t "tree -ah --du"

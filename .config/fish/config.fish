# Starship prompt — must be in config.fish (conf.d/ loads before this file)
starship init fish | source

# mise — version manager (Java, Gradle, etc.)
mise activate fish | source

# fzf : intégration via le plugin PatrickF1/fzf.fish (voir fish_plugins),
# pas `fzf --fish` — les deux rebindent Ctrl-R et entrent en conflit.

# Machine-local config (secrets, per-machine overrides — NOT tracked by yadm)
if test -f ~/.localrc.fish
    source ~/.localrc.fish
end

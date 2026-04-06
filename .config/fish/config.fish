# Starship prompt — must be in config.fish (conf.d/ loads before this file)
starship init fish | source

# fzf integration (requires fzf >= 0.46.0 — current: 0.65.2 ✓)
fzf --fish | source

# Machine-local config (secrets, per-machine overrides — NOT tracked by yadm)
if test -f ~/.localrc.fish
    source ~/.localrc.fish
end

function fish_user_key_bindings
    # Ctrl-G : git status without losing the current line
    bind \cg 'echo; git status; commandline -f repaint'

    # Alt-R : jump to the git repository root (uses grt)
    bind \er 'grt; commandline -f repaint'

    # Ctrl-Z : toggle — resume the last suspended job in foreground
    bind \cz 'fg 2>/dev/null; commandline -f repaint'
end

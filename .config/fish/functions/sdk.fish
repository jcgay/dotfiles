# Fish wrapper for sdkman (bass cannot export bash functions)
function sdk
    set -gx SDKMAN_DIR $HOME/.sdkman

    set -l cmd $argv[1]

    # Normalize common aliases
    switch $cmd
        case l ls
            set cmd list
        case v
            set cmd version
        case u
            set cmd use
        case i
            set cmd install
        case rm
            set cmd uninstall
        case c
            set cmd current
        case ug
            set cmd upgrade
        case d
            set cmd default
        case h
            set cmd help
        case e
            set cmd env
    end

    # Commands that only inspect (no shell mutation needed): run via libexec or bash
    switch $cmd
        case version current help home
            if test -x $SDKMAN_DIR/libexec/$cmd
                $SDKMAN_DIR/libexec/$cmd $argv[2..]
            else
                bass source $SDKMAN_DIR/bin/sdkman-init.sh ";" sdk $argv
            end
        case '*'
            # Commands that may mutate the shell environment (use, default, env, install, etc.)
            bass source $SDKMAN_DIR/bin/sdkman-init.sh ";" sdk $argv
    end
end

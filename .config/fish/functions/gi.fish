function gi --description 'Print .gitignore templates from GitHub (replaces chtignore)'
    if test (count $argv) -eq 0; or contains -- $argv[1] -h --help
        echo "gi - print .gitignore templates from GitHub (via gh api)"
        echo
        echo "Usage:"
        echo "  gi <Template>...   print one or more templates (case-sensitive)"
        echo "  gi list            list available templates (root + Global/)"
        echo "  gi -h | --help     show this help"
        echo
        echo "Examples:"
        echo "  gi Go"
        echo "  gi Go Java JetBrains"
        echo "  gi Go > .gitignore"
        return
    end
    if test "$argv[1]" = list
        begin
            gh api /gitignore/templates --jq '.[]'
            gh api /repos/github/gitignore/contents/Global --jq '.[].name | rtrimstr(".gitignore")'
        end 2>/dev/null | sort
        return
    end
    for t in $argv
        # root templates via the gitignore API, else fall back to Global/
        set -l src (gh api /gitignore/templates/$t --jq .source 2>/dev/null)
        or set src (gh api /repos/github/gitignore/contents/Global/$t.gitignore -H "Accept: application/vnd.github.raw" 2>/dev/null)
        or begin
            echo "  (introuvable: $t)" >&2
            continue
        end
        echo "# $t"
        printf '%s\n' $src
    end
end

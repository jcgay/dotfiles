function vsc --description 'Open in VSCode'
    code $argv
end

function vsca --description 'Open in VSCode (add to workspace)'
    code --add $argv
end

function vscr --description 'Open in VSCode (reuse window)'
    code --reuse-window $argv
end

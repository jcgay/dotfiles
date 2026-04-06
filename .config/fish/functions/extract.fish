function extract --description 'Extract any archive format'
    if test (count $argv) -eq 0
        echo "Usage: extract <file> [file2 ...]"
        return 1
    end
    for file in $argv
        if not test -f $file
            echo "extract: '$file' is not a valid file"
            continue
        end
        switch $file
            case '*.tar.bz2'
                tar xjf $file
            case '*.tar.gz'
                tar xzf $file
            case '*.tar.xz'
                tar xJf $file
            case '*.tar.zst'
                tar --zstd -xf $file
            case '*.bz2'
                bunzip2 $file
            case '*.rar'
                unrar x $file
            case '*.gz'
                gunzip $file
            case '*.tar'
                tar xf $file
            case '*.tbz2'
                tar xjf $file
            case '*.tgz'
                tar xzf $file
            case '*.zip'
                unzip $file
            case '*.Z'
                uncompress $file
            case '*.7z'
                7z x $file
            case '*.xz'
                unxz $file
            case '*.zst'
                zstd -d $file
            case '*'
                echo "extract: '$file' - unknown archive format"
        end
    end
end

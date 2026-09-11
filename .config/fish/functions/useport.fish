function useport --description 'Find process listening on port'
    lsof -nP -iTCP:$argv -sTCP:LISTEN
end

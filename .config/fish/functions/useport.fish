function useport --description 'Find process listening on port'
    lsof -n -i4TCP:$argv | grep LISTEN
end

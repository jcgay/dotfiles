alias dockerclean="docker ps -a | grep 'days ago\|weeks ago' | awk '{print $1}' | gxargs --no-run-if-empty docker rm"
alias dockercleani="docker images | grep '<none>' | awk '{print $3}' | gxargs --no-run-if-empty docker rmi -f"
alias dockerstop="docker stop $(docker ps -a -q)"
alias dco="docker-compose"

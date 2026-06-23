# Docker env (Work class — certs for dockersw2)
set -gx DOCKERSW2_CERT "$HOME/.dockersw2/client-jenkins-cert.pem"
set -gx DOCKERSW2_CACERT "$HOME/.dockersw2/ca.pem"
set -gx DOCKERSW2_KEY "$HOME/.dockersw2/client-jenkins-key.pem"

# Docker aliases
alias dco "docker-compose"
alias ctopsw "dockersw run --rm -ti --name=ctop --volume /var/run/docker.sock:/var/run/docker.sock:ro quay.io/vektorlab/ctop:latest"
alias ctopbo "dockerbo run --rm -ti --name=ctop --volume /var/run/docker.sock:/var/run/docker.sock:ro quay.io/vektorlab/ctop:latest"

function dockerclean --description 'Remove old stopped containers'
    docker ps -a | grep 'days ago\|weeks ago' | awk '{print $1}' | gxargs --no-run-if-empty docker rm
end

function dockercleani --description 'Remove untagged images'
    docker images | grep '<none>' | awk '{print $3}' | gxargs --no-run-if-empty docker rmi -f
end

function dockerstop --description 'Stop all running containers'
    docker stop (docker ps -a -q)
end

function dockerhosts --description 'List containers and their VIRTUAL_HOST/LETSENCRYPT_HOST'
    set -l docker $argv
    test -z "$docker"; and set docker docker
    $docker ps -q | gxargs --no-run-if-empty $docker inspect | jq -r '
        .[]
        | .Name[1:] as $name
        | (.Config.Env // [] | map(capture("^(?<key>[^=]+)=(?<value>.*)$")) | from_entries) as $env
        | ($env.LETSENCRYPT_HOST // $env.VIRTUAL_HOST) as $host
        | select($host != null)
        | "\($name)\t\($host)"' | column -t
end

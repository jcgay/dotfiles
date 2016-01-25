#!/bin/sh

brew install docker docker-machine docker-compose xhyve docker-machine-driver-xhyve

sudo chown root:wheel $(brew --prefix)/opt/docker-machine-driver-xhyve/bin/docker-machine-driver-xhyve
sudo chmod u+s $(brew --prefix)/opt/docker-machine-driver-xhyve/bin/docker-machine-driver-xhyve

docker-machine create --driver virtualbox dev
docker-machine create xhyve --driver xhyve --xhyve-experimental-nfs-share

exit 0
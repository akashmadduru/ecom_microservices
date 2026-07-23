docker stop $(docker ps -aq)
docker system prune -a --volumes -f


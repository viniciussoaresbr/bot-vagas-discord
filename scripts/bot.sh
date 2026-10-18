#!/usr/bin/env bash
# Executado no Debian: atalhos do Docker Compose para administrar o bot.
set -euo pipefail

cd "$(dirname "$0")/.."

case "${1:-}" in
  up)
    if [ ! -f .env ]; then
      echo "Arquivo .env não encontrado. Copie o .env.example e preencha." >&2
      exit 1
    fi
    docker compose config --quiet
    docker compose up -d --build
    docker compose ps
    ;;
  stop) docker compose stop ;;
  restart) docker compose restart ;;
  status) docker compose ps ;;
  logs) docker compose logs -f --tail=100 ;;
  rebuild) docker compose build --pull && docker compose up -d ;;
  shell) docker compose exec bot sh ;;
  stats) docker stats --no-stream "$(docker compose ps -q bot)" ;;
  *)
    echo "Uso: $0 {up|stop|restart|status|logs|rebuild|shell|stats}" >&2
    exit 1
    ;;
esac

#!/usr/bin/env bash
# Executado no Fedora: envia o projeto ao servidor, sem segredos nem dependências locais.
# Uso: scripts/deploy.sh [usuario@host] [diretorio-remoto]
set -euo pipefail

# "debian-server" é um Host do ~/.ssh/config (veja o README); aceita também usuario@ip.
REMOTE="${1:-debian-server}"
REMOTE_DIR="${2:-apps/meu-bot}"

cd "$(dirname "$0")/.."

echo "==> Verificando acesso SSH a $REMOTE"
ssh -o ConnectTimeout=10 "$REMOTE" true

echo "==> Criando ~/$REMOTE_DIR"
ssh "$REMOTE" "mkdir -p ~/'$REMOTE_DIR'"

# No rsync vale a primeira regra que casar: o .env.example entra antes de .env.* ser excluído.
# Sem --delete: arquivos antigos no servidor (inclusive o .env) nunca são apagados.
echo "==> Transferindo arquivos"
rsync -av \
  --include .env.example \
  --exclude .env \
  --exclude '.env.*' \
  --exclude node_modules/ \
  --exclude dist/ \
  --exclude data/ \
  --exclude .git/ \
  --exclude docs/ \
  --exclude '*.tsbuildinfo' \
  ./ "$REMOTE:$REMOTE_DIR/"

if ssh "$REMOTE" "test -f ~/'$REMOTE_DIR'/.env"; then
  echo "==> .env encontrado no servidor."
else
  echo "==> ATENÇÃO: ~/$REMOTE_DIR/.env não existe no servidor. Crie-o antes de iniciar o bot."
fi

echo "==> Concluído. No servidor: cd ~/$REMOTE_DIR && ./scripts/bot.sh up"

#!/bin/sh
# Ponto de entrada do container `app`.
#
# Roda a cada início do container — inclusive num reinício depois de queda
# de energia ou num `docker compose up -d --build` de atualização — porque
# aplicar a migration é justamente o passo que mais se esquece quando é
# manual, e esquecê-lo deixa a aplicação no ar com o schema desatualizado,
# falhando de um jeito que não aponta para a causa.
set -eu

echo "[entrypoint] Aplicando migrations..."
npx prisma migrate deploy

echo "[entrypoint] Executando seed (idempotente; não sobrescreve usuário existente)..."
npx tsx prisma/seed.ts || echo "[entrypoint] Seed ignorado (ver mensagem acima)."

echo "[entrypoint] Iniciando o servidor..."
exec "$@"

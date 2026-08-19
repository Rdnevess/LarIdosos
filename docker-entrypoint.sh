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
if ! npx tsx prisma/seed.ts; then
  # O seed falhar não impede o sistema de subir — mas precisa aparecer no
  # log com destaque. O cenário caro é o binário nativo do Argon2 não
  # carregar (arquitetura errada, musl sem a lib esperada etc.): o
  # servidor sobe, o HTTPS funciona, a tela de login aparece, e ninguém
  # consegue entrar porque o usuário inicial nunca foi criado. Sem este
  # aviso, o diagnóstico disso numa VPS remota custa horas.
  echo "[entrypoint] AVISO: o seed falhou. Se este for o primeiro deploy,"
  echo "[entrypoint] NÃO haverá usuário para entrar. Veja o erro acima"
  echo "[entrypoint] antes de tentar acessar o sistema."
fi

echo "[entrypoint] Iniciando o servidor..."
exec "$@"

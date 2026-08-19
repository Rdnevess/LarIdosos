#!/bin/sh
# Backup diário do banco de dados e dos documentos anexados.
#
# Copia dois conteúdos: o banco Postgres inteiro (prontuário, cadastro,
# auditoria) e o volume `lar_uploads` (documentos pessoais anexados —
# RG, laudos, comprovantes). Os dois são criptografados com GPG ANTES de
# sair da VPS, porque o destino remoto (Passo 4) é armazenamento de
# terceiro e o conteúdo aqui é dado sensível de trinta pessoas idosas.
#
# Procedimento completo, agendamento no cron e teste de restauração:
# docs/operacao/backup.md — leia antes de mudar este script.
set -eu

# Carrega POSTGRES_USER/POSTGRES_DB do mesmo arquivo usado pelo
# `docker compose` de produção (Tarefa 17: o arquivo se chama
# `.env.producao`, não `.env`, de propósito). Isto é obrigatório: quando
# este script roda via cron, o processo herda um ambiente praticamente
# vazio — não o shell de quem administra a VPS por SSH. Sem carregar o
# arquivo aqui, POSTGRES_USER/POSTGRES_DB ficariam indefinidas e, com
# "set -u" acima, o script morreria com "unbound variable" — um erro que
# não aponta a causa para quem só olhar o log às 3h da manhã.
ARQUIVO_ENV="${ARQUIVO_ENV:-/opt/lar/.env.producao}"
[ -f "$ARQUIVO_ENV" ] || {
  echo "Arquivo de ambiente não encontrado: $ARQUIVO_ENV" >&2
  exit 1
}
. "$ARQUIVO_ENV"

DESTINO="${DESTINO_BACKUP:-/var/backups/lar}"
REMOTO="${RCLONE_REMOTO:-}"
SENHA_GPG="${SENHA_BACKUP:?Defina SENHA_BACKUP}"
CARIMBO=$(date +%Y-%m-%d_%H%M)

# Trava de segurança para o comando de retenção no fim do script: um
# DESTINO_BACKUP vazio ou igual a "/" (erro de digitação na variável de
# ambiente do cron, por exemplo) faria o "find ... -delete" varrer o
# disco inteiro em vez de só os backups antigos. O padrão acima já é
# seguro; isto é uma segunda trava para o caso de alguém sobrescrevê-lo.
case "$DESTINO" in
  "" | /)
    echo "DESTINO_BACKUP inválido (vazio ou raiz do sistema): '$DESTINO'" >&2
    exit 1
    ;;
esac

mkdir -p "$DESTINO"
# Só o dono lê — durante os passos 1 e 2, os arquivos aqui ainda estão em
# texto claro (a criptografia só acontece no passo 3).
chmod 700 "$DESTINO"

ARQUIVO_BANCO_SQL="$DESTINO/banco_$CARIMBO.sql"
ARQUIVO_BANCO_GZ="$DESTINO/banco_$CARIMBO.sql.gz"
ARQUIVO_UPLOADS_GZ="$DESTINO/uploads_$CARIMBO.tar.gz"

# Se o script morrer no meio (rede caiu, VPS reiniciou etc.), isto garante
# que nenhuma cópia em texto claro do prontuário fique esquecida no disco
# — só os arquivos que já passaram pelo GPG (passo 3) devem sobreviver.
# Depois do passo 3, os três arquivos abaixo já não existem mais, então
# este `rm -f` na saída normal não apaga nada de útil.
trap 'rm -f "$ARQUIVO_BANCO_SQL" "$ARQUIVO_BANCO_GZ" "$ARQUIVO_UPLOADS_GZ"' EXIT

echo "[1/4] Exportando o banco..."
# Redireciona para arquivo em vez de "pg_dump | gzip > arquivo": este
# shell (sh/dash) não tem "pipefail", então numa pipeline o "set -e" só
# enxerga o código de saída do ÚLTIMO comando (o gzip, que quase sempre
# terminaria bem mesmo se o pg_dump tivesse falhado e produzido saída
# vazia). Fazendo em dois passos, uma falha do pg_dump (ex.: senha errada,
# banco fora do ar) interrompe o script aqui, com o erro real do pg_dump
# visível no log — não um arquivo de backup vazio que passa por "sucesso".
docker compose --env-file "$ARQUIVO_ENV" exec -T db \
  pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" > "$ARQUIVO_BANCO_SQL"
[ -s "$ARQUIVO_BANCO_SQL" ] || {
  echo "O dump do banco saiu vazio — abortando sem enviar nada." >&2
  exit 1
}
gzip "$ARQUIVO_BANCO_SQL"

echo "[2/4] Empacotando os arquivos enviados..."
docker run --rm -v lar_uploads:/dados -v "$DESTINO":/saida alpine \
  tar czf "/saida/uploads_$CARIMBO.tar.gz" -C /dados .
[ -s "$ARQUIVO_UPLOADS_GZ" ] || {
  echo "O empacotamento dos uploads saiu vazio — abortando sem enviar nada." >&2
  exit 1
}

echo "[3/4] Criptografando..."
for arquivo in "$ARQUIVO_BANCO_GZ" "$ARQUIVO_UPLOADS_GZ"; do
  # --pinentry-mode loopback: sem isto, o GPG pode tentar abrir um prompt
  # interativo (pinentry) mesmo com --batch, o que trava um cron sem
  # terminal. Com --passphrase, o loopback é o modo correto para
  # automação.
  gpg --batch --yes --pinentry-mode loopback --passphrase "$SENHA_GPG" \
    --symmetric --cipher-algo AES256 "$arquivo"
  rm "$arquivo"
done

echo "[4/4] Enviando para fora da VPS..."
if [ -n "$REMOTO" ]; then
  rclone copy "$DESTINO" "$REMOTO" --include "*_$CARIMBO.*.gpg"
else
  echo "AVISO: RCLONE_REMOTO não definido — a cópia ficou só nesta VPS." >&2
  echo "AVISO: um único disco não é backup de verdade. Configure o envio" >&2
  echo "AVISO: remoto (docs/operacao/backup.md) assim que possível." >&2
fi

# Retenção local: mantém 30 dias na VPS. A cópia remota (se configurada)
# segue a política de retenção do próprio destino remoto, não esta linha.
# "-maxdepth 1" restringe a busca ao próprio $DESTINO (sem descer em
# subdiretórios) e "-type f" só alcança arquivos comuns — combinado com a
# trava de $DESTINO acima, este comando não tem como apagar nada fora do
# diretório de backup.
find "$DESTINO" -maxdepth 1 -type f -name "*.gpg" -mtime +30 -delete

echo "Backup $CARIMBO concluído."

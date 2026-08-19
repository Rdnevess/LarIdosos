#!/bin/sh
# Backup diário do banco de dados e dos documentos anexados.
#
# Copia dois conteúdos: o banco Postgres inteiro (prontuário, cadastro,
# auditoria) e o volume `lar_uploads` (documentos pessoais anexados —
# RG, laudos, comprovantes). Os dois são criptografados com GPG ANTES de
# sair da VPS, porque o destino remoto (passo [5/6]) é armazenamento de
# terceiro e o conteúdo aqui é dado sensível de trinta pessoas idosas.
#
# Procedimento completo, agendamento no cron e teste de restauração:
# docs/operacao/backup.md — leia antes de mudar este script.
set -eu

# Só as duas variáveis necessárias, extraídas — não `.` no arquivo
# inteiro. O env-file do Compose não é script de shell: a senha do
# Postgres é escolhida por humano, e um `$(...)` ali (por acidente ou
# não) viraria comando executado como root pelo cron, que é quem roda
# este script.
ARQUIVO_ENV="${ARQUIVO_ENV:-/opt/lar/.env.producao}"
[ -f "$ARQUIVO_ENV" ] || { echo "Arquivo de ambiente não encontrado: $ARQUIVO_ENV" >&2; exit 1; }
# Tolera espaço em volta do "=" e aspas em volta do valor — são as
# variações que uma pessoa introduz ao editar o .env.producao à mão
# (POSTGRES_USER = lar, POSTGRES_USER="lar" etc.), e um `sed` ingênuo
# ("s/^POSTGRES_USER=//p") não reconheceria nenhuma das duas.
ler_env() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$ARQUIVO_ENV" \
    | head -1 | sed 's/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//'
}
PGUSER=$(ler_env POSTGRES_USER)
PGDB=$(ler_env POSTGRES_DB)
[ -n "$PGUSER" ] && [ -n "$PGDB" ] || { echo "POSTGRES_USER/POSTGRES_DB ausentes em $ARQUIVO_ENV" >&2; exit 1; }

DESTINO="${DESTINO_BACKUP:-/var/backups/lar}"
REMOTO="${RCLONE_REMOTO:-}"
COMPOSE="docker compose --env-file $ARQUIVO_ENV"
CARIMBO=$(date +%Y-%m-%d_%H%M)

# A senha vai por arquivo, não por argumento: `--passphrase` na linha de
# comando fica visível, enquanto o gpg roda, para qualquer usuário local
# que rode `ps aux` — e este script roda todo dia, de madrugada, sem
# ninguém olhando.
ARQUIVO_SENHA="${ARQUIVO_SENHA_BACKUP:-/opt/lar/.senha-backup}"
[ -f "$ARQUIVO_SENHA" ] || { echo "Arquivo de senha não encontrado: $ARQUIVO_SENHA" >&2; exit 1; }

# Trava de segurança para o "find ... -delete" do passo [6/6]: um
# DESTINO_BACKUP com erro de digitação (ex.: "/var" em vez de
# "/var/backups/lar") não pode virar uma exclusão em massa fora da pasta
# de backups.
case "$DESTINO" in
  /|/root|/home|/var|/etc|/usr) echo "DESTINO_BACKUP perigoso: $DESTINO" >&2; exit 1 ;;
esac

mkdir -p "$DESTINO"
# Só o dono lê — durante os passos [2/6] e [3/6], os arquivos aqui ainda
# estão em texto claro (a criptografia só acontece no passo [4/6]).
chmod 700 "$DESTINO"

BANCO="$DESTINO/banco_$CARIMBO.sql"
UPLOADS="$DESTINO/uploads_$CARIMBO.tar.gz"
# Se o script morrer no meio (rede caiu, disco encheu etc.), isto garante
# que nenhuma cópia em texto claro do prontuário fique esquecida no
# disco — só os arquivos que já passaram pelo GPG devem sobreviver. No
# fim do script, depois de tudo dar certo, o trap é desarmado (ver
# "trap - EXIT" antes da mensagem final).
trap 'rm -f "$BANCO" "$BANCO.gz" "$UPLOADS"' EXIT

echo "[1/6] Conferindo que o volume de uploads existe..."
# `docker run -v lar_uploads:...` CRIA o volume se ele não existir — um
# erro de nome (ou rodar antes do primeiro deploy) produziria um tar de
# diretório vazio, criptografado e enviado como se fosse backup de
# verdade, sem nenhum erro. Volume legitimamente vazio (sistema novo,
# ninguém anexou nada ainda) é um caso válido; volume inexistente não.
docker volume inspect lar_uploads >/dev/null

echo "[2/6] Exportando o banco..."
# Sem pipe: o código de saída de "a | b" é o de "b" — este shell não tem
# "pipefail" — então um pg_dump que falhasse (senha errada, banco fora
# do ar, conexão perdida) seria mascarado por um gzip bem-sucedido sobre
# entrada vazia. "--clean --if-exists" grava, antes de cada tabela, os
# comandos para apagá-la se já existir: é o que permite restaurar este
# dump sobre um banco que já tem dados (ver scripts/restaurar.sh) sem
# gerar conflito de chave.
$COMPOSE exec -T db pg_dump -U "$PGUSER" --clean --if-exists --no-owner "$PGDB" > "$BANCO"

# "[ -s ]" só pega arquivo vazio. Um dump truncado (disco cheio, conexão
# perdida no meio da exportação) passaria por esse teste com um arquivo
# grande, porém incompleto. O pg_dump sempre termina com esta linha de
# comentário — sua ausência é o sinal confiável de dump incompleto.
tail -5 "$BANCO" | grep -q 'PostgreSQL database dump complete' \
  || { echo "Dump incompleto — abortando sem enviar nada." >&2; exit 1; }
gzip -f "$BANCO"

echo "[3/6] Empacotando os arquivos enviados..."
docker run --rm -v lar_uploads:/dados -v "$DESTINO":/saida alpine:3.20 \
  tar czf "/saida/uploads_$CARIMBO.tar.gz" -C /dados .

echo "[4/6] Criptografando..."
for arquivo in "$BANCO.gz" "$UPLOADS"; do
  # --pinentry-mode loopback: sem isto, o GPG pode tentar abrir um
  # prompt interativo (pinentry) mesmo com --batch, o que trava um cron
  # sem terminal.
  gpg --batch --yes --pinentry-mode loopback \
      --passphrase-file "$ARQUIVO_SENHA" \
      --symmetric --cipher-algo AES256 "$arquivo"
  rm -f "$arquivo"
done

echo "[5/6] Enviando para fora da VPS..."
if [ -n "$REMOTO" ]; then
  rclone copy "$DESTINO" "$REMOTO" --include "*_$CARIMBO.*.gpg"
  # "rclone copy" com um filtro que não casa nenhum arquivo copia zero e
  # sai com código 0 — um remoto mal configurado (nome errado, sem
  # permissão de escrita silenciosamente ignorada) pareceria ter dado
  # certo. Conferir a contagem depois é o que torna esse passo confiável.
  enviados=$(rclone lsf "$REMOTO" --include "*_$CARIMBO.*.gpg" | wc -l)
  [ "$enviados" -eq 2 ] || { echo "Esperava 2 arquivos no remoto, encontrei $enviados." >&2; exit 1; }
else
  echo "AVISO: RCLONE_REMOTO não definido — a cópia ficou apenas local." >&2
  echo "AVISO: um único disco não é backup de verdade. Configure o envio" >&2
  echo "AVISO: remoto (docs/operacao/backup.md) assim que possível." >&2
fi

echo "[6/6] Aplicando retenção de 30 dias..."
# Retenção só da cópia local — a remota segue a política do próprio
# destino (ver docs/operacao/backup.md). "-maxdepth 1" restringe a busca
# ao próprio $DESTINO (sem descer em subdiretórios, como o
# "pre-restauracao_*" que scripts/restaurar.sh pode criar ali) e
# "-type f" só alcança arquivos comuns — combinado com a trava de
# $DESTINO acima, este comando não tem como apagar nada fora da pasta de
# backup.
find "$DESTINO" -maxdepth 1 -type f -name "*.gpg" -mtime +30 -delete

# Marca de sucesso: um segundo cron (semanal, por exemplo) pode conferir
# a idade deste arquivo e alertar se envelhecer demais. Sem isto, um
# backup quebrado é indistinguível de um saudável até alguém abrir o log
# por conta própria — e o modo de falha que mais importa aqui é
# "ninguém percebe".
date +%Y-%m-%dT%H:%M > "$DESTINO/ultimo_sucesso"

trap - EXIT
echo "Backup $CARIMBO concluído."

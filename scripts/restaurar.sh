#!/bin/sh
# Restauração do banco de dados e dos documentos anexados a partir de um
# backup gerado por scripts/backup.sh.
#
# DESTRUTIVO: substitui o banco de dados e TODOS os documentos anexados
# atuais pelo conteúdo dos dois arquivos informados. Qualquer cadastro
# feito depois da data desse backup é perdido. Guarda uma cópia do
# estado atual antes de sobrescrever (passo [1/6]) para o caso de o
# arquivo errado ter sido escolhido — mas não existe desfazer a
# substituição em si.
#
# Procedimento completo (incluindo o teste de restauração obrigatório
# antes de colocar o sistema em uso real) e o registro dos testes já
# feitos: docs/operacao/backup.md — leia antes de rodar isto pela
# primeira vez.
#
# Uso:
#   sh scripts/restaurar.sh <banco.sql.gz.gpg> <uploads.tar.gz.gpg>
set -eu

# Mesmo arquivo de ambiente usado por scripts/backup.sh — ver o
# comentário equivalente lá sobre extrair só as duas variáveis
# necessárias em vez de carregar o arquivo inteiro como script.
ARQUIVO_ENV="${ARQUIVO_ENV:-/opt/lar/.env.producao}"
[ -f "$ARQUIVO_ENV" ] || { echo "Arquivo de ambiente não encontrado: $ARQUIVO_ENV" >&2; exit 1; }
PGUSER=$(sed -n 's/^POSTGRES_USER=//p' "$ARQUIVO_ENV" | head -1)
PGDB=$(sed -n 's/^POSTGRES_DB=//p' "$ARQUIVO_ENV" | head -1)
[ -n "$PGUSER" ] && [ -n "$PGDB" ] || { echo "POSTGRES_USER/POSTGRES_DB ausentes." >&2; exit 1; }

ARQUIVO_BANCO="${1:?Informe o arquivo .sql.gz.gpg do banco. Uso: sh scripts/restaurar.sh <banco.sql.gz.gpg> <uploads.tar.gz.gpg>}"
ARQUIVO_UPLOADS="${2:?Informe o arquivo .tar.gz.gpg dos uploads. Uso: sh scripts/restaurar.sh <banco.sql.gz.gpg> <uploads.tar.gz.gpg>}"
[ -f "$ARQUIVO_BANCO" ] || { echo "Não encontrei: $ARQUIVO_BANCO" >&2; exit 1; }
[ -f "$ARQUIVO_UPLOADS" ] || { echo "Não encontrei: $ARQUIVO_UPLOADS" >&2; exit 1; }

ARQUIVO_SENHA="${ARQUIVO_SENHA_BACKUP:-/opt/lar/.senha-backup}"
[ -f "$ARQUIVO_SENHA" ] || { echo "Arquivo de senha não encontrado: $ARQUIVO_SENHA" >&2; exit 1; }

DESTINO="${DESTINO_BACKUP:-/var/backups/lar}"
COMPOSE="docker compose --env-file $ARQUIVO_ENV"
CARIMBO=$(date +%Y-%m-%d_%H%M)

# Diretório de trabalho próprio (não nomes fixos em /tmp): evita colisão
# entre restaurações concorrentes e, no passo [3/6], monta no container
# efêmero só esta pasta — não o /tmp inteiro da VPS. O trap remove tudo
# (inclusive o dump do banco em texto claro, temporário) mesmo se o
# script falhar no meio.
TRABALHO=$(mktemp -d)
trap 'rm -rf "$TRABALHO"' EXIT

echo "ATENÇÃO: isto SUBSTITUI o banco e TODOS os documentos atuais."
echo "  Banco:    $ARQUIVO_BANCO"
echo "  Arquivos: $ARQUIVO_UPLOADS"
echo "Confira os carimbos de data acima antes de continuar."
printf 'Digite RESTAURAR para confirmar: '
read -r resposta
[ "$resposta" = "RESTAURAR" ] || { echo "Abortado."; exit 1; }

echo "[1/6] Guardando o estado atual antes de sobrescrever..."
# O erro provável não é ignorar que a operação é destrutiva — é escolher
# o carimbo errado entre dois nomes quase idênticos, de madrugada, num
# incidente. Sem esta cópia não há volta.
mkdir -p "$DESTINO"
# Mesma proteção de scripts/backup.sh: esta pasta guarda, a partir de
# agora, um dump em texto claro do banco atual (sem criptografia — ver
# aviso no fim deste script e em docs/operacao/backup.md).
chmod 700 "$DESTINO"
RESGUARDO="$DESTINO/pre-restauracao_$CARIMBO"
mkdir -p "$RESGUARDO"
$COMPOSE exec -T db pg_dump -U "$PGUSER" --clean --if-exists --no-owner "$PGDB" \
  > "$RESGUARDO/banco.sql"
docker run --rm -v lar_uploads:/dados -v "$RESGUARDO":/saida alpine:3.20 \
  tar czf /saida/uploads.tar.gz -C /dados .
echo "      Estado anterior guardado em $RESGUARDO"

echo "[2/6] Descriptografando..."
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$ARQUIVO_SENHA" \
    -o "$TRABALHO/banco.sql.gz" -d "$ARQUIVO_BANCO"
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$ARQUIVO_SENHA" \
    -o "$TRABALHO/uploads.tar.gz" -d "$ARQUIVO_UPLOADS"

echo "[3/6] Validando os pacotes ANTES de tocar nos dados..."
# Sem esta validação, um tarball corrompido só seria descoberto depois
# de o volume já ter sido esvaziado — os documentos apagados e nada
# para repor.
gunzip -t "$TRABALHO/banco.sql.gz"
docker run --rm -v "$TRABALHO":/entrada alpine:3.20 \
  tar tzf /entrada/uploads.tar.gz > /dev/null

echo "[4/6] Restaurando o banco..."
$COMPOSE stop app
gunzip -c "$TRABALHO/banco.sql.gz" > "$TRABALHO/banco.sql"
# "-v ON_ERROR_STOP=1" é o que impede a restauração de "concluir com
# sucesso" sem ter restaurado nada: sobre um banco já povoado, sem essa
# opção, um COPY que colidisse com uma linha existente abortaria só
# aquela tabela — o psql seguiria adiante e sairia com código 0, e o
# "set -e" nunca dispararia. É seguro usar ON_ERROR_STOP aqui porque o
# dump foi gerado com "--clean --if-exists" (scripts/backup.sh): cada
# tabela é apagada e recriada, não há mais erro de "já existe" para
# interromper o script no lugar errado.
$COMPOSE exec -T db psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d "$PGDB" < "$TRABALHO/banco.sql"

echo "[5/6] Restaurando os arquivos..."
# Extrai ao lado (".novo") e só então troca: o volume nunca fica vazio
# sem substituto — se o "tar xzf" falhasse aqui (algo que a validação do
# passo [3/6] não pegou), o conteúdo atual continuaria intacto. Termina
# ajustando o dono para 1001:1001 porque o container "app" roda como o
# usuário não-root "lar" (uid 1001, ver Dockerfile) — arquivos escritos
# por este container efêmero, que roda como root, ficariam ilegíveis
# para a aplicação sem este chown.
docker run --rm -v lar_uploads:/dados -v "$TRABALHO":/entrada alpine:3.20 sh -c '
  set -e
  rm -rf /dados/.novo && mkdir -p /dados/.novo
  tar xzf /entrada/uploads.tar.gz -C /dados/.novo
  find /dados -mindepth 1 -maxdepth 1 ! -name .novo -exec rm -rf {} +
  mv /dados/.novo/* /dados/ 2>/dev/null || true
  mv /dados/.novo/.[!.]* /dados/ 2>/dev/null || true
  rmdir /dados/.novo
  chown -R 1001:1001 /dados
'

echo "[6/6] Subindo a aplicação..."
$COMPOSE start app

echo "Restauração concluída."
echo "Confira na aplicação: o residente aparece E o documento anexado abre."
echo "Estado anterior, se precisar voltar: $RESGUARDO"
echo "Esse estado anterior NÃO está criptografado — depois de confirmar"
echo "que a restauração foi a que você queria, apague-o (rm -rf) ou"
echo "criptografe-o manualmente antes de deixar a VPS sem supervisão."

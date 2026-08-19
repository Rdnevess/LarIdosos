#!/bin/sh
# Restauração do banco de dados e dos documentos anexados a partir de um
# backup gerado por scripts/backup.sh.
#
# DESTRUTIVO: substitui o banco de dados e TODOS os documentos anexados
# atuais pelo conteúdo dos dois arquivos informados. Qualquer cadastro
# feito depois da data desse backup é perdido. Não existe desfazer depois
# de confirmar.
#
# Procedimento completo (incluindo o teste de restauração obrigatório
# antes de colocar o sistema em uso real) e o registro dos testes já
# feitos: docs/operacao/backup.md — leia antes de rodar isto pela
# primeira vez.
#
# Uso:
#   sh scripts/restaurar.sh <banco.sql.gz.gpg> <uploads.tar.gz.gpg>
set -eu

# Mesmo arquivo de ambiente usado por scripts/backup.sh e pelo
# `docker compose` de produção — ver o comentário equivalente em
# backup.sh sobre o cron rodar com ambiente vazio.
ARQUIVO_ENV="${ARQUIVO_ENV:-/opt/lar/.env.producao}"
[ -f "$ARQUIVO_ENV" ] || {
  echo "Arquivo de ambiente não encontrado: $ARQUIVO_ENV" >&2
  exit 1
}
. "$ARQUIVO_ENV"

ARQUIVO_BANCO="${1:?Informe o arquivo .sql.gz.gpg do banco. Uso: sh scripts/restaurar.sh <banco.sql.gz.gpg> <uploads.tar.gz.gpg>}"
ARQUIVO_UPLOADS="${2:?Informe o arquivo .tar.gz.gpg dos uploads. Uso: sh scripts/restaurar.sh <banco.sql.gz.gpg> <uploads.tar.gz.gpg>}"
SENHA_GPG="${SENHA_BACKUP:?Defina SENHA_BACKUP}"

[ -f "$ARQUIVO_BANCO" ] || {
  echo "Arquivo não encontrado: $ARQUIVO_BANCO" >&2
  exit 1
}
[ -f "$ARQUIVO_UPLOADS" ] || {
  echo "Arquivo não encontrado: $ARQUIVO_UPLOADS" >&2
  exit 1
}

echo "============================================================"
echo "ATENÇÃO: esta operação é destrutiva e não pode ser desfeita."
echo
echo "Ela vai substituir AGORA:"
echo "  - todo o banco de dados atual (residentes, avaliações,"
echo "    responsáveis, anotações, auditoria, usuários)"
echo "  - todos os documentos anexados atuais"
echo
echo "pelo conteúdo destes dois arquivos de backup:"
echo "  banco:   $ARQUIVO_BANCO"
echo "  uploads: $ARQUIVO_UPLOADS"
echo
echo "Qualquer cadastro feito DEPOIS da data desse backup será perdido."
echo "Se não tiver certeza, pressione Ctrl+C agora e confira novamente"
echo "qual arquivo pretendia usar."
echo "============================================================"
printf 'Digite RESTAURAR (tudo em maiúsculas) para confirmar: '
read -r CONFIRMACAO
if [ "$CONFIRMACAO" != "RESTAURAR" ]; then
  echo "Cancelado. Nada foi alterado." >&2
  exit 1
fi

# Diretório temporário próprio para esta restauração (em vez de nomes
# fixos em /tmp): evita colisão com outra restauração rodando ao mesmo
# tempo e, no passo 3, monta no container efêmero só esta pasta — não o
# /tmp inteiro da VPS, que pode ter outros arquivos de outros processos.
# O trap remove tudo (inclusive o prontuário em texto claro, temporário)
# mesmo se o script falhar no meio.
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

echo "[1/3] Descriptografando..."
gpg --batch --yes --pinentry-mode loopback --passphrase "$SENHA_GPG" \
  -o "$TEMP_DIR/banco.sql.gz" -d "$ARQUIVO_BANCO"
gpg --batch --yes --pinentry-mode loopback --passphrase "$SENHA_GPG" \
  -o "$TEMP_DIR/uploads.tar.gz" -d "$ARQUIVO_UPLOADS"

# Descompacta para arquivo (não para um pipe direto ao psql): pelo mesmo
# motivo do backup.sh — sem "pipefail" neste shell, um "gunzip | psql"
# esconderia uma falha do gunzip (arquivo corrompido, senha errada) atrás
# do código de saída do psql. Assim, uma falha aqui interrompe o script
# ANTES de mexer no banco.
gunzip -c "$TEMP_DIR/banco.sql.gz" > "$TEMP_DIR/banco.sql"
[ -s "$TEMP_DIR/banco.sql" ] || {
  echo "O dump do banco descriptografado ficou vazio — abortando sem tocar no banco atual." >&2
  exit 1
}

echo "[2/3] Restaurando o banco..."
docker compose --env-file "$ARQUIVO_ENV" stop app
# Sem "-v ON_ERROR_STOP=1" de propósito: o entrypoint do container `app`
# já rodou "prisma migrate deploy" e criou as tabelas (vazias) na
# primeira subida — então este dump, que também contém os comandos
# "CREATE TABLE"/"CREATE TYPE" de quando foi gerado, imprime uma leva de
# erros "já existe" no início. Isso é esperado e aparece no terminal;
# com ON_ERROR_STOP o script pararia bem ali, ANTES de restaurar
# qualquer linha de dado. Sem ele, o psql segue adiante e os comandos
# "COPY" (os dados de verdade) rodam normalmente contra as tabelas já
# existentes.
docker compose --env-file "$ARQUIVO_ENV" exec -T db \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < "$TEMP_DIR/banco.sql"

echo "[3/3] Restaurando os arquivos..."
# Os três padrões de glob (não só "/dados/*") são de propósito: "*"
# sozinho não alcança arquivos começados por ponto, e o volume ficaria
# com lixo de uma restauração anterior num caso raro. É o idioma padrão
# de shell POSIX para esvaziar um diretório por completo, inclusive
# ocultos — sem depender de "find -delete" (o "find" do BusyBox, usado
# na imagem "alpine", nem sempre traz esse recurso). O "-f" do "rm" evita
# erro quando algum dos padrões não casa com nada.
docker run --rm -v lar_uploads:/dados -v "$TEMP_DIR":/entrada alpine \
  sh -c "rm -rf /dados/* /dados/.[!.]* /dados/..?* && tar xzf /entrada/uploads.tar.gz -C /dados"

docker compose --env-file "$ARQUIVO_ENV" start app

echo "Restauração concluída."
echo "Confira agora, pela tela do sistema: entre com um usuário existente,"
echo "confirme que os cadastros aparecem e que um documento anexado abre"
echo "de fato (não só que aparece listado)."

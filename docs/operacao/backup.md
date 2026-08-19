# Backup e restauração

"Backup nunca verificado é backup que não existe — e o sistema guarda o
prontuário de 30 pessoas em disco único" (spec, §13). Este documento
existe para que essa frase nunca vire verdade aqui: ele descreve o que é
copiado, para onde vai, por quanto tempo fica guardado, como restaurar, e
traz o procedimento — obrigatório, numerado, com o registro datado do
resultado — que prova que a restauração funciona de verdade, não só no
papel.

Não considere o sistema pronto para uso real (cadastro dos ~30
residentes) antes de completar a seção "Teste de restauração obrigatório"
abaixo pelo menos uma vez.

## O que é copiado

Todo dia, `scripts/backup.sh` copia dois conteúdos:

1. **O banco de dados inteiro** (`pg_dump` do banco `lar`) — cadastro dos
   residentes, avaliações de dependência, responsáveis, anotações,
   funcionários, usuários e a trilha de auditoria.
2. **O volume `lar_uploads`** — os documentos pessoais anexados (RG,
   laudos, comprovantes, fotos), como um `.tar.gz` do volume inteiro.

Os dois são **criptografados com GPG (simétrico, AES-256) antes de sair
da VPS** — nunca depois. O destino remoto (rclone, se configurado) é
armazenamento de terceiro; o conteúdo aqui é prontuário e documento
pessoal de pessoas idosas, e não deve trafegar nem ficar guardado em
texto claro fora do disco da própria VPS.

## Para onde vai

- **Local, sempre:** `/var/backups/lar` (ou o caminho de
  `DESTINO_BACKUP`, se você mudar o padrão), já criptografado.
- **Remoto, se configurado:** para onde `RCLONE_REMOTO` apontar (um
  bucket S3-compatível, Backblaze B2, Google Drive etc. — qualquer
  destino que o `rclone` suporte). **Sem isto, o backup existe só nesta
  VPS** — um problema no disco desta máquina destrói ao mesmo tempo o
  sistema em produção e todas as cópias de segurança. Configurar o envio
  remoto não é opcional para este sistema, é o que faz o backup ser,
  de fato, backup.

Cada arquivo tem o nome `banco_AAAA-MM-DD_HHMM.sql.gz.gpg` ou
`uploads_AAAA-MM-DD_HHMM.tar.gz.gpg`.

## Retenção

- **Local:** 30 dias. `scripts/backup.sh` apaga, ao final de cada
  execução, os arquivos `.gpg` de `DESTINO_BACKUP` com mais de 30 dias.
  Isto só alcança arquivos diretamente dentro desse diretório (não desce
  em subpastas) e o script se recusa a rodar se `DESTINO_BACKUP` estiver
  vazio ou for `/` — para que um erro de digitação na variável de
  ambiente nunca vire uma exclusão em massa fora da pasta de backups.
- **Remota:** segue a política do destino escolhido (o `find ... -delete`
  do script só atua na cópia local). Se o remoto tiver sua própria
  retenção/versionamento, configure-a lá; este projeto não presume nada
  sobre isso.

Prontuário tem guarda obrigatória de **20 anos** após o último registro
(Resolução CFM 1.821/2007) — os 30 dias acima são só da cópia de
segurança local recente, não um prazo de descarte do prontuário em si.

## A senha de criptografia (`SENHA_BACKUP`)

Gere uma vez, com uma senha forte:

```bash
openssl rand -base64 32
```

Esta senha **não fica guardada em nenhum arquivo do repositório nem no
`.env.producao`** — ela só existe na linha do `crontab` (Passo 3, abaixo)
e na cabeça de quem administra o sistema. Isso é proposital: separa quem
consegue rodar o backup (qualquer um com acesso à VPS) de quem consegue
decifrá-lo.

**Se esta senha se perder, todos os backups já feitos ficam
permanentemente ilegíveis** — criptografia simétrica não tem "esqueci
minha senha". Dado que o prontuário precisa ficar preservado por 20 anos,
guarde esta senha em **pelo menos dois lugares diferentes**, fora da VPS
(por exemplo: um gerenciador de senhas da organização **e** uma cópia
física, escrita, guardada em local trancado). Perder a VPS inteira sem
perder esta senha ainda permite recuperar tudo a partir do backup remoto;
perder esta senha, mesmo com a VPS intacta, não permite recuperar nada
dos backups antigos.

## Configuração inicial (uma vez, na VPS)

```bash
# GPG geralmente já vem instalado; confirme:
gpg --version

# rclone, só se for usar envio remoto (recomendado):
curl https://rclone.org/install.sh | sudo bash
rclone config
```

`rclone config` é interativo e pergunta qual serviço de nuvem usar — siga
as instruções na tela (documentação: https://rclone.org/docs/). O nome
que você der ao remoto ali (ex.: `b2` ou `s3`) é o que entra em
`RCLONE_REMOTO=<nome-do-remoto>:<bucket-ou-pasta>` no Passo 3.

## Agendamento no cron

```bash
crontab -e
```

Adicione a linha (troque `xxx` pela senha gerada acima e o valor de
`RCLONE_REMOTO` pelo remoto configurado — remova essa variável se ainda
não tiver envio remoto configurado):

```
0 3 * * * cd /opt/lar && SENHA_BACKUP=xxx RCLONE_REMOTO=remoto:lar-backup ARQUIVO_ENV=/opt/lar/.env.producao sh scripts/backup.sh >> /var/log/lar-backup.log 2>&1
```

O cron roda com um ambiente praticamente vazio — bem diferente do shell
de quem loga por SSH. Por isso a linha acima define tudo que o script
precisa explicitamente (`SENHA_BACKUP`, `RCLONE_REMOTO`, `ARQUIVO_ENV`),
e o próprio `scripts/backup.sh` carrega `POSTGRES_USER`/`POSTGRES_DB` de
dentro do `.env.producao` em vez de esperar que o ambiente já os tenha.
Um backup que falha silenciosamente às 3h da manhã só costuma ser
descoberto no dia em que alguém precisa restaurar — daí `>>
/var/log/lar-backup.log 2>&1` no fim da linha: confira esse arquivo de
vez em quando (`tail -50 /var/log/lar-backup.log`), não só quando algo
já deu errado.

## Como restaurar

`scripts/restaurar.sh` é **destrutivo**: substitui o banco de dados e
todos os documentos anexados atuais pelo conteúdo dos dois arquivos de
backup informados. Ele pede confirmação digitada (`RESTAURAR`, em
maiúsculas) antes de tocar em qualquer coisa — leia o aviso que aparece
na tela antes de digitar.

```bash
cd /opt/lar
SENHA_BACKUP='<a senha de criptografia>' sh scripts/restaurar.sh \
  /var/backups/lar/banco_AAAA-MM-DD_HHMM.sql.gz.gpg \
  /var/backups/lar/uploads_AAAA-MM-DD_HHMM.tar.gz.gpg
```

Troque os dois caminhos pelos arquivos que você quer restaurar (liste
`ls -la /var/backups/lar` para ver os disponíveis, ou baixe-os do
armazenamento remoto primeiro se estiver recuperando de uma VPS nova).
Os dois arquivos (banco e uploads) têm que ser do **mesmo carimbo de
data/hora** — misturar um banco de um dia com uploads de outro dia deixa
documentos referenciados no banco que não existem no volume, ou
vice-versa.

### Por que aparecem erros "já existe" durante a restauração

Ao restaurar sobre um container `db` que já rodou `prisma migrate
deploy` (o caso normal — o entrypoint do `app` faz isso toda vez que o
container sobe), o `psql` imprime uma leva de erros "relation ... already
exists" logo no início: o dump inclui os comandos que criam as tabelas, e
elas já existem. **Isso é esperado e não interrompe a restauração** — os
dados de verdade (`COPY`) vêm depois e são aplicados normalmente. Se a
restauração parece ter terminado sem a mensagem final "Restauração
concluída.", aí sim há um problema — veja "Problemas comuns" no fim deste
documento.

## Teste de restauração obrigatório

Este teste é o que separa "escrevemos um script de backup" de "sabemos
que ele funciona". Faça-o **de verdade**, na VPS de produção, depois do
primeiro deploy e **antes de cadastrar os ~30 residentes reais** — nesse
momento o banco só tem o usuário inicial, então uma restauração completa
não arrisca dado real nenhum.

1. **Cadastre um residente de teste, com nome bem reconhecível.** Pela
   tela do sistema: menu "Residentes" → "Novo residente" → preencha os
   campos obrigatórios com um nome que não deixe dúvida, por exemplo
   `TESTE BACKUP 2026-08-19` (use a data do dia) → Salvar.
2. **Anexe um documento a ele.** Na ficha do residente recém-criado,
   abra a seção "Documentos" e envie um arquivo qualquer (uma foto ou um
   PDF pequeno) pelo formulário ali. Confirme que ele aparece na lista,
   como um link com o nome do arquivo.
3. **Anote, sem fechar a tela:** o nome exato digitado no passo 1 e o
   nome do arquivo enviado no passo 2. Você vai precisar dos dois para
   confirmar, no passo 9, que voltaram.
4. **Rode o backup, pelo terminal da VPS (SSH):**
   ```bash
   cd /opt/lar
   SENHA_BACKUP='<a senha de criptografia>' sh scripts/backup.sh
   ```
   Confirme que terminou com `Backup AAAA-MM-DD_HHMM concluído.` e anote
   esse carimbo — precisa dele nos passos 5 e 8.
5. **Confirme que os dois arquivos foram criados:**
   ```bash
   ls -la /var/backups/lar
   ```
   Devem aparecer `banco_<carimbo>.sql.gz.gpg` e
   `uploads_<carimbo>.tar.gz.gpg` com o carimbo do passo 4.
6. **Apague o residente de teste diretamente no banco** (não pela tela
   do sistema — aqui o objetivo é simular uma perda de dado, não testar
   a exclusão da aplicação):
   ```bash
   docker compose --env-file .env.producao exec db psql -U lar -d lar
   ```
   (troque `lar` se você mudou `POSTGRES_USER`/`POSTGRES_DB` no
   `.env.producao` — mesma observação de `docs/operacao/implantacao.md`)

   Dentro do `psql` que abrir, rode (troque o nome pelo que você digitou
   no passo 1):
   ```sql
   DELETE FROM documentos WHERE "residenteId" = (SELECT id FROM residentes WHERE "nomeCompleto" = 'TESTE BACKUP 2026-08-19');
   DELETE FROM residentes WHERE "nomeCompleto" = 'TESTE BACKUP 2026-08-19';
   ```
   Saia com `\q`.
7. **Confirme, pela tela do sistema, que o residente sumiu** da lista de
   Residentes.
8. **Restaure**, usando os dois arquivos do passo 5:
   ```bash
   cd /opt/lar
   SENHA_BACKUP='<a senha de criptografia>' sh scripts/restaurar.sh \
     /var/backups/lar/banco_<carimbo>.sql.gz.gpg \
     /var/backups/lar/uploads_<carimbo>.tar.gz.gpg
   ```
   Digite `RESTAURAR` quando pedido. Vai aparecer uma leva de erros
   "já existe" no meio do processo — é esperado (ver seção acima) e não
   interrompe o script. Espere a mensagem final `Restauração concluída.`.
9. **Confirme, pela tela do sistema** (entre de novo, se a sessão tiver
   caído com o reinício do `app`):
   - **(a)** o residente de teste voltou a aparecer na lista de
     Residentes, com o mesmo nome anotado no passo 3;
   - **(b)** na ficha dele, o documento enviado no passo 2 aparece na
     seção "Documentos";
   - **(c)** ao clicar no link do documento, ele **abre de verdade** — o
     navegador baixa ou exibe o arquivo, não um erro.

   **O item (c) é o que mais importa.** Um backup de banco que restaura
   sem os arquivos é uma falha silenciosa clássica: a tela mostra o
   documento na lista (o item (b) passaria) e só quando alguém clica é
   que o link quebra. Não marque este teste como concluído sem conferir
   o (c) especificamente.
10. **Se os três itens do passo 9 forem verdadeiros**, apague o
    residente de teste normalmente pela tela do sistema (o botão de
    exclusão do próprio cadastro), para não ficar misturado com os
    residentes reais.
11. **Registre o resultado** na tabela abaixo: data, quem executou, e o
    resultado de cada item do passo 9.

### Registro dos testes de restauração

| Data | Executado por | 9a (residente voltou) | 9b (documento listado) | 9c (documento abre) | Observações |
|---|---|---|---|---|---|
| _PENDENTE_ | — | — | — | — | Este teste não foi executado ainda. A Tarefa 18 escreveu e revisou os scripts e esta documentação, mas **não pôde rodar o teste real** — a máquina onde os scripts foram escritos não tem Docker. Preencha esta linha (data real, no formato AAAA-MM-DD, e resultado observado) na primeira vez que alguém rodar o procedimento acima na VPS de produção. Só depois disso o sistema deve receber o cadastro dos ~30 residentes reais (ver "Ao terminar a Fase 1" em `docs/superpowers/plans/2026-08-18-fase-1-nucleo-cadastral.md`). |

Repita o teste completo **a cada 6 meses**. A partir do segundo teste
(quando já houver residentes reais cadastrados), **não repita os passos
1–11 acima direto na produção** — veja a próxima seção.

## Repetindo o teste com dados reais já cadastrados

O procedimento acima usa `scripts/restaurar.sh` de verdade, contra os
containers de produção — e ele substitui o banco **inteiro**, não só o
residente de teste. Na primeira vez (passo a passo anterior), isso é
seguro porque não existe dado real além do usuário inicial. Depois que
os ~30 residentes estiverem cadastrados e o sistema em uso diário, rodar
a mesma restauração completa em produção descartaria qualquer cadastro,
anotação ou documento feito por qualquer funcionário depois do instante
do backup usado no teste — mesmo que sejam só alguns minutos, é risco
desnecessário para um teste periódico.

Em vez disso, restaure o backup mais recente **num Postgres descartável,
isolado**, que não toca em `lar_pgdata` nem em `lar_uploads`:

```bash
# 1. Suba um Postgres descartável (nome e dados isolados da produção)
docker run -d --name teste-restauracao \
  -e POSTGRES_USER=lar -e POSTGRES_PASSWORD=teste -e POSTGRES_DB=lar \
  postgres:18-alpine
sleep 5
docker exec teste-restauracao pg_isready -U lar

# 2. Descriptografe o backup mais recente numa pasta temporária
mkdir -p /tmp/teste-restauracao && cd /tmp/teste-restauracao
SENHA_BACKUP='<a senha de criptografia>'
gpg --batch --yes --pinentry-mode loopback --passphrase "$SENHA_BACKUP" \
  -o banco.sql.gz -d /var/backups/lar/banco_<carimbo>.sql.gz.gpg
gunzip banco.sql.gz
gpg --batch --yes --pinentry-mode loopback --passphrase "$SENHA_BACKUP" \
  -o uploads.tar.gz -d /var/backups/lar/uploads_<carimbo>.tar.gz.gpg

# 3. Carregue o dump no Postgres descartável (banco novo e vazio, sem
#    nenhum conflito com dado que já exista ali)
cat banco.sql | docker exec -i teste-restauracao psql -U lar -d lar

# 4. Confira que um residente real (ou o de teste, se ainda estiver
#    dentro do prazo de 30 dias de retenção) está presente
docker exec teste-restauracao psql -U lar -d lar -c \
  "SELECT \"nomeCompleto\" FROM residentes ORDER BY \"criadoEm\" DESC LIMIT 5;"

# 5. Confira a integridade de um documento sem precisar de interface
#    gráfica: compare o hash do arquivo dentro do pacote com o hash
#    gravado no banco pela própria aplicação no momento do envio
#    (coluna "hashSha256" de "documentos"). Troque o caminho pelo que
#    aparecer na coluna "caminhoArmazenamento" do documento escolhido.
tar xzf uploads.tar.gz '2026/08/<arquivo>.pdf'
sha256sum '2026/08/<arquivo>.pdf' | awk '{print $1}'
docker exec teste-restauracao psql -U lar -d lar -c \
  "SELECT \"hashSha256\" FROM documentos WHERE \"caminhoArmazenamento\" = '2026/08/<arquivo>.pdf';"
# os dois hashes (o do "awk" acima e o da consulta) têm que ser iguais,
# caractere por caractere.

# 6. Derrube tudo — nada disto tocou a produção
docker rm -f teste-restauracao
rm -rf /tmp/teste-restauracao
```

Isto confirma exatamente a mesma coisa que o teste completo (o backup
descriptografa, o banco carrega, o arquivo bate byte a byte com o que
estava registrado) sem arriscar nenhum dado real da produção. Registre
esse teste na mesma tabela acima.

## Problemas comuns

**`scripts/backup.sh` termina com "Arquivo de ambiente não encontrado".**
Confirme que `/opt/lar/.env.producao` existe (é o mesmo arquivo do
Passo 5 de `docs/operacao/implantacao.md`) ou passe o caminho certo em
`ARQUIVO_ENV=...` antes do comando.

**"O dump do banco saiu vazio — abortando" ou "O empacotamento dos
uploads saiu vazio — abortando".** O script para sozinho antes de
criptografar ou enviar qualquer coisa. A causa mais comum é o container
`db` fora do ar (`docker compose --env-file .env.producao ps` para
conferir) ou `POSTGRES_USER`/`POSTGRES_DB` errados em `.env.producao`.
Backup nenhum foi produzido — não há arquivo incompleto para se
preocupar em limpar.

**`scripts/restaurar.sh` parou no meio, com um erro, e a aplicação (`app`)
ficou fora do ar.** Isto é proposital, não um bug: o script para `app`
antes de tocar no banco (passo 2) e só o coloca de volta no ar no fim,
depois dos três passos terem terminado. Se algo falhar no meio, é
preferível que o sistema fique fora do ar até alguém investigar do que
voltar ao ar com dados possivelmente incompletos. Leia a mensagem de erro
acima no terminal, corrija a causa e rode `sh scripts/restaurar.sh`
de novo com os mesmos dois arquivos — ou, se preferir só recolocar a
aplicação no ar sem restaurar de novo (por exemplo, se o problema era só
o `db` momentaneamente fora do ar), `docker compose --env-file
.env.producao start app`.

**Depois de `scripts/restaurar.sh` terminar normalmente, a aplicação não
sobe.** Veja `docker compose --env-file .env.producao logs -f app`. O
container `db` precisa estar saudável antes do `app` voltar — confira com
`docker compose --env-file .env.producao ps`. Se o problema persistir, os
"Problemas comuns" de `docs/operacao/implantacao.md` cobrem os sintomas
mais comuns de um container `app` que não sobe.

**Preciso restaurar numa VPS nova (a antiga morreu de verdade).** Siga
`docs/operacao/implantacao.md` até o fim do Passo 7 (containers no ar,
com um banco vazio recém-criado pelo `prisma migrate deploy` e pelo
seed). Baixe os dois arquivos `.gpg` mais recentes do armazenamento
remoto (`rclone copy remoto:lar-backup/banco_....gpg .` e o mesmo para
`uploads_...`) e então rode `scripts/restaurar.sh` normalmente, como
descrito acima.

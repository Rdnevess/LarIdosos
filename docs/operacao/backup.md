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

1. **O banco de dados inteiro** (`pg_dump --clean --if-exists --no-owner`
   do banco `lar`) — cadastro dos residentes, avaliações de dependência,
   responsáveis, anotações, funcionários, usuários e a trilha de
   auditoria. `--clean --if-exists` grava, junto com cada tabela, o
   comando para apagá-la antes de recriá-la — é o que permite que
   `scripts/restaurar.sh` substitua o banco de verdade, mesmo que ele já
   tenha dados (ver "Como restaurar", abaixo).
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
  em subpastas — o que importa porque `scripts/restaurar.sh` cria ali uma
  subpasta `pre-restauracao_<carimbo>`, ver "Como restaurar") e o script
  se recusa a rodar se `DESTINO_BACKUP` for a raiz do sistema ou uma
  pasta do sistema (`/`, `/root`, `/home`, `/var`, `/etc`, `/usr`) — para
  que um erro de digitação na variável de ambiente nunca vire uma
  exclusão em massa fora da pasta de backups.
- **Remota:** segue a política do destino escolhido (o `find ... -delete`
  do script só atua na cópia local). Se o remoto tiver sua própria
  retenção/versionamento, configure-a lá; este projeto não presume nada
  sobre isso.

Prontuário tem guarda obrigatória de **20 anos** após o último registro
(Resolução CFM 1.821/2007) — os 30 dias acima são só da cópia de
segurança local recente, não um prazo de descarte do prontuário em si.

## A senha de criptografia

A senha vive num **arquivo**, não numa variável de ambiente:
`/opt/lar/.senha-backup` por padrão (ajustável com `ARQUIVO_SENHA_BACKUP`
se preferir outro caminho). Isto é proposital — `--passphrase` na linha
de comando do GPG fica visível, enquanto o comando roda, para qualquer
usuário local que rode `ps aux`; um arquivo com permissão restrita não
tem esse vazamento, e também não fica gravado no histórico do shell nem
na linha do `crontab` (que qualquer processo com `crontab -l` consegue
ler).

Gere a senha uma vez, na VPS:

```bash
openssl rand -base64 32 | sudo tee /opt/lar/.senha-backup >/dev/null
sudo chmod 600 /opt/lar/.senha-backup
sudo chown root:root /opt/lar/.senha-backup
```

**Se este arquivo se perder (e não tiver cópia em outro lugar), todos os
backups já feitos ficam permanentemente ilegíveis** — criptografia
simétrica não tem "esqueci minha senha". Dado que o prontuário precisa
ficar preservado por 20 anos, guarde o **conteúdo** dessa senha em pelo
menos mais um lugar, fora da VPS (por exemplo: um gerenciador de senhas
da organização **e** uma cópia física, escrita, guardada em local
trancado). Perder a VPS inteira sem perder essa senha ainda permite
recuperar tudo a partir do backup remoto; perder a senha, mesmo com a
VPS intacta, não permite recuperar nada dos backups antigos.

## Configuração inicial (uma vez, na VPS)

```bash
# GPG geralmente já vem instalado; confirme:
gpg --version

# rclone, só se for usar envio remoto (recomendado):
curl https://rclone.org/install.sh | sudo bash
rclone config

# A senha de criptografia (ver seção anterior):
openssl rand -base64 32 | sudo tee /opt/lar/.senha-backup >/dev/null
sudo chmod 600 /opt/lar/.senha-backup
sudo chown root:root /opt/lar/.senha-backup
```

`rclone config` é interativo e pergunta qual serviço de nuvem usar — siga
as instruções na tela (documentação: https://rclone.org/docs/). O nome
que você der ao remoto ali (ex.: `b2` ou `s3`) é o que entra em
`RCLONE_REMOTO=<nome-do-remoto>:<bucket-ou-pasta>` no agendamento abaixo.

## Agendamento no cron

```bash
crontab -e
```

Adicione as linhas (troque `coordenacao@lar.exemplo.org.br` por um
e-mail de verdade que alguém confira, e o valor de `RCLONE_REMOTO` pelo
remoto configurado — remova essa variável se ainda não tiver envio
remoto configurado, mas veja o aviso em "Para onde vai" sobre isso):

```
MAILTO=coordenacao@lar.exemplo.org.br

# `>>` leva só a saída normal para o log. O erro (stderr) NÃO é
# redirecionado: é o que sobra nos descritores que o cron observa, e é
# o que faz o MAILTO valer alguma coisa. Com `2>&1` aqui, o cron não
# veria byte nenhum e o MAILTO ficaria decorativo — é o tipo de coisa
# que alguém "arruma" depois, sem saber que está desligando o alerta.
0 3 * * * cd /opt/lar && RCLONE_REMOTO=remoto:lar-backup ARQUIVO_ENV=/opt/lar/.env.producao sh scripts/backup.sh >> /var/log/lar-backup.log

# Alerta diário se o último sucesso envelhecer OU nunca tiver existido.
# A ordem importa: `[ -f marca ] && ...` ficaria mudo justamente no pior
# caso — backup quebrado desde o primeiro dia, marca nunca criada,
# nenhum aviso jamais. O `tee -a` grava no log E deixa passar para o
# cron, que então envia o e-mail — um `>>` sozinho aqui teria o mesmo
# problema da linha de cima.
0 8 * * * find /var/backups/lar/ultimo_sucesso -mtime -2 2>/dev/null | grep -q . || echo "$(date): ALERTA - backup do Lar sem sucesso ha mais de 2 dias" | tee -a /var/log/lar-backup.log
```

Repare que **não há senha nenhuma nestas linhas** — `scripts/backup.sh`
lê `/opt/lar/.senha-backup` sozinho (ver seção anterior). Colocar a
senha na linha do `crontab`, mesmo que fosse mais conveniente, ficaria
visível para qualquer processo que rodasse `crontab -l` e entraria no
histórico do shell de quem editasse o arquivo. O cron roda com um
ambiente praticamente vazio — bem diferente do shell de quem loga por
SSH. Por isso a primeira linha define o que o script precisa
(`RCLONE_REMOTO`, `ARQUIVO_ENV`), e o próprio `scripts/backup.sh` extrai
`POSTGRES_USER`/`POSTGRES_DB` de dentro do `.env.producao` em vez de
esperar que o ambiente já os tenha.

**O `MAILTO` só funciona porque as duas linhas deixam a saída chegar ao
cron.** Ele envia por e-mail o que o comando agendado escreve nos
próprios descritores — se a linha redireciona tudo para um arquivo
(`>> log 2>&1`), não sobra nada para enviar e o `MAILTO` vira enfeite.
Por isso o backup redireciona só a saída normal, e o alerta usa `tee`
em vez de `>>`.

Ainda assim, o e-mail depende de a VPS ter um agente de envio
configurado — muitas não têm por padrão. **Confirme que chega:**

```bash
echo teste | mail -s teste seu@email
```

Se não chegar, o log continua sendo a fonte de verdade, e vale combinar
com alguém a rotina de abri-lo — não presuma que o `MAILTO` está
funcionando só porque a linha está lá.

Um backup que falha silenciosamente às 3h da manhã só costuma ser
descoberto no dia em que alguém precisa restaurar — daí a segunda linha
de cron acima, que depende de uma marca que `scripts/backup.sh` grava:
só em caso de sucesso completo, ele escreve a hora atual em
`$DESTINO/ultimo_sucesso` (por padrão,
`/var/backups/lar/ultimo_sucesso`).

**A ordem do teste importa.** Uma versão mais óbvia desse alerta seria
"se a marca existe e está velha, avise":
`[ -f ultimo_sucesso ] && ! find ... -mtime -2 | grep -q . && echo ALERTA`.
Essa versão fica **muda exatamente no pior caso**: se o backup nunca
funcionou desde o primeiro dia (arquivo de senha nunca criado, usuário
do banco errado, nome do volume errado — qualquer coisa que aborte o
script antes da linha que grava a marca), o arquivo `ultimo_sucesso`
nunca chega a existir, a primeira condição (`-f`) já é falsa, e nenhum
alerta é emitido — para sempre. A versão usada acima inverte a lógica
(`find ... | grep -q . || echo ALERTA`): dispara tanto se a marca está
velha **quanto** se ela nunca existiu, porque `find` sobre um caminho
inexistente também não imprime nada e a condição de ausência de saída
(`grep -q .` falhando) cobre os dois casos igualmente. Rodar diariamente
(não semanalmente) também importa: verificar só uma vez por semana um
limite de 2 dias deixa até 7 dias de janela cega entre uma falha
acontecer e alguém ser avisado.

Continue conferindo `tail -50 /var/log/lar-backup.log` de vez em quando,
mesmo com o alerta — ele cobre "o backup parou de funcionar", não
"o backup está funcionando mas produzindo algo errado".

Esse arquivo de log fica **fora** do Docker, então o limite de tamanho do
`docker-compose.yml` não o alcança: sem rotação ele cresce todo dia, para
sempre, no mesmo disco que guarda o banco. A entrada de logrotate está em
`docs/operacao/implantacao.md`, seção "Rotação dos logs" — configure-a
junto com o cron acima.

## Como restaurar

`scripts/restaurar.sh` é **destrutivo**: substitui o banco de dados e
todos os documentos anexados atuais pelo conteúdo dos dois arquivos de
backup informados — de verdade, tabela por tabela (ver "Por que a
restauração substitui os dados de verdade", abaixo). Ele pede confirmação
digitada (`RESTAURAR`, em maiúsculas) antes de tocar em qualquer coisa —
leia o aviso que aparece na tela antes de digitar.

Antes de sobrescrever qualquer coisa, o próprio script guarda uma cópia
do estado **atual** (antes da restauração) em
`$DESTINO/pre-restauracao_<carimbo>/` — um `banco.sql.gpg` e um
`uploads.tar.gz.gpg`, **criptografados com a mesma chave** de
`/opt/lar/.senha-backup` (ou o caminho de `ARQUIVO_SENHA_BACKUP`, se você
mudou o padrão). Essa cópia existe para o caso de o arquivo errado ter
sido escolhido para restaurar (dois nomes de backup quase idênticos,
escolhidos errado num incidente de madrugada, é o erro mais provável aqui
— não esquecer que a operação é destrutiva). Ela passa pelo mesmo GPG que
os backups normais, e o texto claro é removido logo depois de
criptografar — é o prontuário inteiro de novo, então não podia ficar em
claro no disco esperando alguém lembrar de protegê-lo à mão, mesmo se o
script falhar no meio dessa criptografia (o `trap` de limpeza cobre esse
caso também). Diferente dos backups normais, essa cópia **não** sai para
o armazenamento remoto: o filtro do `rclone copy` só alcança os arquivos
com o carimbo do backup sendo feito ali, então o resguardo é sempre
local, e serve só para desfazer um engano cometido nesta mesma VPS. Para
abrir, descriptografe do mesmo jeito que qualquer arquivo de backup
normal:

```bash
gpg --batch --yes --pinentry-mode loopback \
  --passphrase-file /opt/lar/.senha-backup \
  -o banco.sql -d /var/backups/lar/pre-restauracao_<carimbo>/banco.sql.gpg
```

Essa pasta não entra na retenção automática de 30 dias do `backup.sh`
(que só olha arquivos `*.gpg` soltos direto em `$DESTINO`, não dentro de
subpastas) — como já está criptografada, não há mais urgência de
confidencialidade em apagá-la, mas ela também não desaparece sozinha.
Depois de confirmar que a restauração foi a que você queria, apague-a
(`rm -rf`) para não acumular pastas antigas sem necessidade.

```bash
cd /opt/lar
sh scripts/restaurar.sh \
  /var/backups/lar/banco_AAAA-MM-DD_HHMM.sql.gz.gpg \
  /var/backups/lar/uploads_AAAA-MM-DD_HHMM.tar.gz.gpg
```

Troque os dois caminhos pelos arquivos que você quer restaurar (liste
`ls -la /var/backups/lar` para ver os disponíveis, ou baixe-os do
armazenamento remoto primeiro se estiver recuperando de uma VPS nova).
Os dois arquivos (banco e uploads) têm que ser do **mesmo carimbo de
data/hora** — misturar um banco de um dia com uploads de outro dia deixa
documentos referenciados no banco que não existem no volume, ou
vice-versa. Repare que **não há senha na linha de comando**: o script lê
`/opt/lar/.senha-backup` sozinho, do mesmo jeito que `backup.sh`.

### Por que a restauração substitui os dados de verdade

O dump é gerado com `pg_dump --clean --if-exists`: cada tabela vem
acompanhada do comando para apagá-la antes de recriá-la. Isso permite
rodar a restauração com `psql -v ON_ERROR_STOP=1` — e essa combinação
importa mais do que parece.

Sem `--clean --if-exists`, restaurar sobre um banco que já tem dados
faria cada `CREATE TABLE` do dump falhar com "já existe", e cada `COPY`
que colidisse com uma linha já existente abortaria **só aquela tabela** —
sem `ON_ERROR_STOP`, o `psql` seguiria adiante mesmo assim e terminaria
com código de saída 0. O script imprimiria "Restauração concluída." **sem
ter restaurado uma única linha em tabelas que já tinham dado**. Não é um
cenário raro: é justamente o caso que mais importa — perda ou corrupção
parcial num sistema que já está em uso, com o banco povoado.

Com `--clean --if-exists` + `ON_ERROR_STOP=1`, cada tabela é
efetivamente apagada e recriada a partir do dump, sem gerar erro no meio
do caminho — e se algo genuíno der errado (conexão perdida, disco cheio),
o `psql` sai com código diferente de zero, o `set -e` do script dispara,
e a restauração para em vez de terminar "com sucesso" pela metade.

**Consequência direta:** a restauração troca o banco inteiro pelo
conteúdo exato do backup escolhido — qualquer cadastro, edição ou
documento feito **depois** daquele backup desaparece. Isso é o
comportamento correto e esperado (é o que faz a restauração confiável),
mas é também por isso que ela nunca deve ser exercida em produção só como
teste de rotina depois que existirem dados reais — ver "Repetindo o
teste com dados reais já cadastrados", mais abaixo.

## Teste de restauração obrigatório

Este teste é o que separa "escrevemos um script de backup" de "sabemos
que ele funciona". Faça-o **de verdade**, na VPS de produção, depois do
primeiro deploy e **antes de cadastrar os ~30 residentes reais** — nesse
momento o banco só tem o usuário inicial, então uma restauração completa
não arrisca dado real nenhum.

1. **Cadastre um residente de teste, com nome bem reconhecível, e anexe
   um documento a ele.** Pela tela do sistema: menu "Residentes" →
   "Novo residente" → preencha os campos obrigatórios com um nome que
   não deixe dúvida, por exemplo `TESTE BACKUP 2026-08-19` (use a data do
   dia) → Salvar. Na ficha do residente recém-criado, abra a seção
   "Documentos" e envie um arquivo qualquer (uma foto ou um PDF pequeno)
   pelo formulário ali. Confirme que ele aparece na lista, como um link
   com o nome do arquivo.

   **Não cadastre mais nada para esse residente** — nem responsável, nem
   anotação, nem avaliação de dependência. Essas três tabelas bloqueiam a
   exclusão direta por SQL do passo 5 (a restrição de chave estrangeira
   rejeita o `DELETE` enquanto existir uma linha dependente); só o
   documento, que não bloqueia.

2. **Anote, sem fechar a tela:** o nome exato digitado acima e o nome do
   arquivo enviado. Você vai precisar dos dois para confirmar, no passo
   8, que voltaram.

3. **Anote também o caminho de armazenamento do documento**, direto do
   banco (vai precisar dele no passo 5 para apagar o arquivo certo do
   volume):
   ```bash
   docker compose --env-file .env.producao exec -T db psql -U lar -d lar \
     -c 'select "caminhoArmazenamento" from documentos;'
   ```
   (troque `lar`/`lar` se você mudou `POSTGRES_USER`/`POSTGRES_DB` no
   `.env.producao`). O resultado é algo como `2026/08/<uuid>.pdf`.

4. **Rode o backup, pelo terminal da VPS (SSH):**
   ```bash
   cd /opt/lar
   sh scripts/backup.sh
   ```
   Confirme que terminou com `Backup AAAA-MM-DD_HHMM concluído.` e anote
   esse carimbo — precisa dele nos passos 7 e 10. Confira também que
   apareceram os dois arquivos (`ls -la /var/backups/lar`).

5. **Apague o residente de teste e o arquivo, nesta ordem** (não pela
   tela do sistema — aqui o objetivo é simular uma perda de dado real):
   ```bash
   docker compose --env-file .env.producao exec db psql -U lar -d lar
   ```
   Dentro do `psql` que abrir, rode (troque o nome pelo que você digitou
   no passo 1):
   ```sql
   delete from documentos where "residenteId" = (select id from residentes where "nomeCompleto" = 'TESTE BACKUP 2026-08-19');
   delete from residentes where "nomeCompleto" = 'TESTE BACKUP 2026-08-19';
   ```
   Saia com `\q`. Agora apague o arquivo do volume, usando o caminho
   anotado no passo 3:
   ```bash
   docker run --rm -v lar_uploads:/dados alpine:3.20 rm -f /dados/<caminho anotado no passo 3>
   ```

6. **Confirme que quebrou antes de restaurar.** Pela tela do sistema, o
   residente sumiu da lista de Residentes. Se você ainda tinha o link do
   documento aberto numa aba, atualize a página: agora dá erro (não
   encontrado). **Sem confirmar isto, o teste pode "passar" mesmo que o
   backup ou a restauração não funcionem** — porque nada de fato teria
   mudado para restaurar de volta.

7. **Restaure**, usando os dois arquivos do passo 4:
   ```bash
   cd /opt/lar
   sh scripts/restaurar.sh \
     /var/backups/lar/banco_<carimbo>.sql.gz.gpg \
     /var/backups/lar/uploads_<carimbo>.tar.gz.gpg
   ```
   Digite `RESTAURAR` quando pedido. Espere a mensagem final
   `Restauração concluída.`.

8. **Confirme, pela tela do sistema** (entre de novo, se a sessão tiver
   caído com o reinício do `app`):
   - **(a)** o residente de teste voltou a aparecer na lista de
     Residentes, com o mesmo nome anotado no passo 2;
   - **(b)** na ficha dele, o documento enviado no passo 1 aparece na
     seção "Documentos";
   - **(c)** ao clicar no link do documento, ele **abre de verdade** — o
     navegador baixa ou exibe o conteúdo do arquivo, não um erro.

   **O item (c) é o que mais importa.** Não basta o documento aparecer na
   lista — clique e confira o conteúdo. Um backup de banco que restaura
   sem os arquivos é uma falha silenciosa clássica: a tela mostra o
   documento (o item (b) passaria) e só quando alguém clica é que o link
   quebra.

9. **Se os três itens do passo 8 forem verdadeiros**, apague o residente
   de teste normalmente pela tela do sistema (o botão de exclusão do
   próprio cadastro), para não ficar misturado com os residentes reais.

10. **Limpe a cópia de resguardo, se quiser.** O `restaurar.sh` do
    passo 7 criou `/var/backups/lar/pre-restauracao_<carimbo>/`, já
    **criptografada** (mesma senha dos backups normais) com o banco e os
    uploads de antes da restauração. Não há urgência de confidencialidade
    — mas ela também não é apagada sozinha (a retenção automática de 30
    dias só olha os arquivos soltos em `/var/backups/lar`, não essa
    subpasta), então, depois de confirmar o passo 8, vale apagá-la
    (`rm -rf`) para não acumular pastas antigas sem necessidade.

11. **Registre o resultado** na tabela abaixo: data, quem executou, e o
    resultado de cada item do passo 8.

### Registro dos testes de restauração

| Data | Executado por | 8a (residente voltou) | 8b (documento listado) | 8c (documento abre) | Observações |
|---|---|---|---|---|---|
| _PENDENTE_ | — | — | — | — | Este teste não foi executado ainda. A Tarefa 18 escreveu, revisou e corrigiu os scripts e esta documentação em três rodadas de correção, mas **não pôde rodar o teste real** — a máquina onde os scripts foram escritos não tem Docker. Preencha esta linha (data real, no formato AAAA-MM-DD, e resultado observado) na primeira vez que alguém rodar o procedimento acima na VPS de produção. Só depois disso o sistema deve receber o cadastro dos ~30 residentes reais (ver "Ao terminar a Fase 1" em `docs/superpowers/plans/2026-08-18-fase-1-nucleo-cadastral.md`). |

### O que já foi verificado fora da VPS, em 23/08/2026

O teste acima continua **pendente** — ele é o único que prova o caminho
inteiro. Mas parte do que os scripts afirmam pôde ser exercitada numa máquina
sem Docker, contra o Postgres 18 local, e passou. Fica registrado para que a
primeira execução na VPS saiba o que já não precisa ser suspeito:

| O que | Como | Resultado |
|---|---|---|
| Sintaxe dos dois scripts | `sh -n` | ok |
| `ler_env` com as variações que o comentário promete tolerar (`X=v`, `X = "v"`, `X='v com espaço'`, ausente, vazio) | função extraída do próprio `backup.sh` e exercitada com um `.env` de teste | ok nas 5 |
| A trava de `DESTINO_BACKUP` | `case` extraído do script, contra `/`, `/var`, `/etc`, `/home`, `/root`, `/usr` e dois caminhos legítimos | recusa os 6, aceita os 2 |
| O marcador `PostgreSQL database dump complete`, que `backup.sh` exige para não enviar dump truncado | `pg_dump 18.6` com as flags do script | presente |
| Ciclo `gzip` → `gpg --symmetric AES256 --passphrase-file` → `gpg -d` → `gunzip -t`, com as flags exatas dos dois scripts | 630 linhas de auditoria e 45 residentes do banco de desenvolvimento | volta íntegro |
| `--clean --if-exists` + `psql -v ON_ERROR_STOP=1` restaurando **sobre banco já povoado** — a hipótese em que o comentário do passo [4/6] de `restaurar.sh` se apoia | restauração aplicada duas vezes seguidas no mesmo banco | saída 0 nas duas, contagens idênticas, sem duplicar |

### Os dois scripts, de ponta a ponta, em 04/09/2026

Depois da verificação parcial da seção anterior, os dois scripts foram
executados **inteiros**, com Docker, na máquina de desenvolvimento — não na
VPS. `sh scripts/backup.sh` e `sh scripts/restaurar.sh`, sem trechos extraídos e
sem adaptação, contra a pilha do `docker-compose.yml`.

**O que apareceu antes de qualquer teste rodar:** o compose não subia. A imagem
`postgres:18-alpine` recusa a montagem em `/var/lib/postgresql/data`, e o
contêiner entrava em ciclo de reinício — logo `app` e `caddy`, que dependem de
`db` saudável, nunca subiriam. `docker compose up -d --build`, o único comando
de implantação, não funcionava. Corrigido para `/var/lib/postgresql`. **Este é
o motivo pelo qual um backup nunca testado é uma hipótese:** o defeito não
estava nos scripts de backup, estava no caminho que eles pressupõem.

Com isso corrigido, o ciclo completo:

| Passo | Resultado |
|---|---|
| `backup.sh` `[1/6]` a `[6/6]` | os seis passos, saída 0 |
| `pg_dump` **de dentro do contêiner**, com o marcador de dump completo | presente |
| `tar` do volume `lar_uploads` e validação `tar tzf` | íntegro |
| `gpg --symmetric AES256` nos dois arquivos | dois `.gpg` no destino, mais `ultimo_sucesso` |
| `[5/6]` sem `RCLONE_REMOTO` | avisa que a cópia ficou só local, e não falha |
| `restaurar.sh` — confirmação `RESTAURAR` | pedida e exigida |
| `[1/6]` resguardo do estado anterior | gravado, criptografado |
| `[3/6]` validação antes de tocar nos dados | **exerceu-se de verdade**: numa primeira tentativa o tarball não foi encontrado e o script abortou **sem** tocar no banco nem no volume |
| `[4/6]` `psql` com `ON_ERROR_STOP=1` sobre banco já povoado e sujo | restaurou |
| `[5/6]` a troca do volume, com `chown 1001:1001` | restaurou |

Conferido depois, contra o estado de antes do backup: o banco voltou com as
contagens exatas (6 e 1000), a linha de lixo inserida entre o backup e a
restauração **não sobreviveu**, e o acento voltou intacto (`Maria da
Conceição`). Os cinco arquivos do volume voltaram byte a byte, o lixo foi
removido, e o dono terminou `1001:1001`.

**Repetido em 05/09/2026 com a pilha inteira de pé.** A imagem foi construída
e o ciclo refeito com `db` e `app` rodando — o que, entre outras coisas, faz o
banco ter o **esquema real**, aplicado pelas migrations do entrypoint, e não
tabelas de amostra.

Antes disso apareceu o segundo defeito de implantação: **a imagem não
construía**. O Dockerfile faz `COPY --from=build /app/public ./public`, e
`public/` não existia no repositório desde 31/08/2026, quando os SVGs de
andaime do Next foram removidos e o diretório vazio sumiu com eles. `docker
compose up -d --build` falhava com `"/app/public": not found`. Corrigido.

Com a pilha de pé, o `restaurar.sh` exercitou o que faltava: `stop app` parou o
contêiner de verdade, e `start app` o subiu de volta. E ficou provada uma coisa
que ninguém tinha verificado — **o dado restaurado sobrevive à subida da
aplicação**. O entrypoint roda `prisma migrate deploy` e o seed a cada start;
depois dele, o marcador continuava com as duas linhas, o acento intacto, e
`usuarios` continuava em **1**: o seed não duplicou o administrador que voltou
no dump.

**O que continua sem prova:** o `rclone` (nenhum remoto configurado), o cron, e
o Caddy com domínio real. Só isso.

**Nota de ambiente, não defeito:** no Git Bash do Windows, o `mktemp -d` de
`restaurar.sh` devolve um caminho que o Docker Desktop não monta, e o passo
`[3/6]` falha ao abrir o tarball. Contorna-se apontando `TMPDIR` para um
caminho que o Docker enxergue. Na VPS Linux, que é onde o script roda, isso não
acontece.

### A metade documental, exercitada em 04/09/2026

A máquina de desenvolvimento passou a ter Docker, e a metade que o parágrafo
abaixo apontava como **nunca exercitada em momento nenhum** — a dos documentos
anexados — foi ao teste. Contra um volume descartável (`lar_uploads_sonda`,
criado e removido; o `lar_uploads` de produção não existe nesta máquina e não
foi tocado), com conteúdo no formato real: subpastas por ano e mês, nomes com
acento e cedilha, um diretório oculto e um arquivo de 3 MB.

| O que | Como | Resultado |
|---|---|---|
| `tar czf` do volume, do passo [2/6] de `backup.sh` | `docker run -v lar_uploads_sonda:/dados alpine:3.20` | pacote gerado |
| `tar tzf` de validação, que o `backup.sh` faz para não enviar tarball corrompido | idem | íntegro |
| `gpg --symmetric --cipher-algo AES256` e `gpg -d`, com as flags exatas dos dois scripts | ida e volta do tarball | volta íntegro |
| **A troca do passo [5/6] de `restaurar.sh`, o bloco inteiro e verbatim** | volume previamente sujo com conteúdo diferente | ver abaixo |

O passo [5/6] é o que nunca tinha sido exercitado, e é o que mais podia dar
errado: ele esvazia o volume e repõe. Verificado, item a item:

- os **seis arquivos voltaram byte a byte** — `md5sum` idêntico em todos;
- **nomes com acento sobreviveram** (`comprovante-pagamento-ação.pdf`,
  `procuração-João-Água.pdf`), que é o caso que uma troca de codificação entre
  `tar` e sistema de arquivos quebraria em silêncio;
- **o diretório oculto sobreviveu** — é para isso que existem as três linhas
  `mv /dados/.novo/.[!.]*` e `..?*`, e sem elas o `.oculto` ficaria para trás;
- **o conteúdo errado que estava no volume foi removido**, e não sobreviveu ao
  lado do restaurado;
- **o dono terminou `1001:1001`** nos seis, como o contêiner `app` precisa.

**O que esta verificação não é:** ela rodou os blocos `docker run` e `gpg`
extraídos dos scripts, não `sh scripts/backup.sh` de ponta a ponta — o caminho
completo exige `.env.producao`, `docker compose` e o contêiner do Postgres de
pé. Continua valendo tudo o que o parágrafo seguinte diz, menos a frase sobre a
restauração dos documentos.

**O que continua sem prova, e por isso a linha acima segue `_PENDENTE_`:** o
`pg_dump` de dentro do contêiner, o `docker compose stop`/`start app`, o envio
pelo `rclone`, o cron, e o `docker volume inspect lar_uploads` contra o volume
de produção de verdade — com a aplicação escrevendo nele, e não com arquivos
postos à mão. A versão do `pg_dump` verificada é a da máquina de
desenvolvimento; a que roda em produção é a do contêiner, e só a execução real
confirma que são compatíveis.

Nenhum dos dois scripts foi executado de ponta a ponta: o que se exercitou
foram os blocos que eles contêm.

Repita o teste completo **a cada 6 meses**. A partir do segundo teste
(quando já houver residentes reais cadastrados), **não repita os passos
1–11 acima direto na produção** — veja a próxima seção.

## Repetindo o teste com dados reais já cadastrados

O procedimento acima usa `scripts/restaurar.sh` de verdade, contra os
containers de produção. Com `--clean --if-exists` + `ON_ERROR_STOP=1`
(ver "Por que a restauração substitui os dados de verdade"), ele
**realmente** troca o banco inteiro pelo conteúdo do backup — não só o
residente de teste, todas as tabelas. Na primeira vez isso é seguro
porque não existe dado real além do usuário inicial. Depois que os ~30
residentes estiverem cadastrados e o sistema em uso diário, rodar essa
mesma restauração completa em produção **descarta de verdade** qualquer
cadastro, anotação, avaliação ou documento feito por qualquer funcionário
depois do instante do backup usado no teste — mesmo que sejam só alguns
minutos, é risco desnecessário para um teste periódico. (O `restaurar.sh`
guarda uma cópia de resguardo do estado anterior antes de sobrescrever —
ver "Como restaurar" — o que ajuda a voltar atrás se isso acontecer por
engano, mas não é motivo para fazer de propósito.)

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
gpg --batch --yes --pinentry-mode loopback \
  --passphrase-file /opt/lar/.senha-backup \
  -o banco.sql.gz -d /var/backups/lar/banco_<carimbo>.sql.gz.gpg
gunzip banco.sql.gz
gpg --batch --yes --pinentry-mode loopback \
  --passphrase-file /opt/lar/.senha-backup \
  -o uploads.tar.gz -d /var/backups/lar/uploads_<carimbo>.tar.gz.gpg

# 3. Carregue o dump no Postgres descartável (banco novo e vazio — os
#    "DROP TABLE IF EXISTS" do --clean não encontram nada para apagar,
#    e ON_ERROR_STOP aqui também serve para acusar qualquer erro real)
cat banco.sql | docker exec -i teste-restauracao psql -v ON_ERROR_STOP=1 -U lar -d lar

# 4. Confira que um residente real (ou o de teste, se ainda estiver
#    dentro do prazo de 30 dias de retenção) está presente
docker exec teste-restauracao psql -U lar -d lar -c "SELECT \"nomeCompleto\" FROM residentes ORDER BY \"criadoEm\" DESC LIMIT 5;"

# 5. Confira a integridade de um documento sem precisar de interface
#    gráfica: compare o hash do arquivo dentro do pacote com o hash
#    gravado no banco pela própria aplicação no momento do envio
#    (coluna "hashSha256" de "documentos"). Troque o caminho pelo que
#    aparecer na coluna "caminhoArmazenamento" do documento escolhido.
tar xzf uploads.tar.gz '2026/08/<arquivo>.pdf'
sha256sum '2026/08/<arquivo>.pdf' | awk '{print $1}'
docker exec teste-restauracao psql -U lar -d lar -c "SELECT \"hashSha256\" FROM documentos WHERE \"caminhoArmazenamento\" = '2026/08/<arquivo>.pdf';"
# os dois hashes (o do "awk" acima e o da consulta) tem que ser iguais,
# caractere por caractere.

# 6. Derrube tudo — nada disto tocou a produção
docker rm -f teste-restauracao
rm -rf /tmp/teste-restauracao
```

Isto confirma os mesmos três fatos que o teste completo confirma — o
backup descriptografa, o banco carrega os dados, o arquivo bate byte a
byte com o que estava registrado — só que por um caminho diferente
(comparação de hash em vez de abrir o link pelo navegador). Não é a
mesma verificação: o teste completo também exercita a rota autenticada
de download da aplicação (`/api/documentos/...`), não só o arquivo em
si, e este atalho isolado não passa por ali. Ele serve para repetir a
checagem periodicamente sem arriscar dado real da produção — não para
substituir o teste completo na primeira vez. Registre esse teste na
mesma tabela acima.

## Problemas comuns

**`scripts/backup.sh` termina com "Arquivo de ambiente não encontrado".**
Confirme que `/opt/lar/.env.producao` existe (é o mesmo arquivo do
Passo 5 de `docs/operacao/implantacao.md`) ou passe o caminho certo em
`ARQUIVO_ENV=...` antes do comando.

**"Arquivo de senha não encontrado".** Falta criar
`/opt/lar/.senha-backup` (ver "Configuração inicial") ou
`ARQUIVO_SENHA_BACKUP` aponta para um caminho errado.

**"Dump incompleto — abortando sem enviar nada".** O script para sozinho
antes de criptografar ou enviar qualquer coisa. A causa mais comum é o
container `db` fora do ar (`docker compose --env-file .env.producao ps`
para conferir), disco cheio na VPS, ou a conexão ter caído no meio da
exportação. Backup nenhum foi produzido — não há arquivo incompleto para
se preocupar em limpar.

**"Esperava 2 arquivos no remoto, encontrei N".** O `rclone copy` correu
sem erro, mas nem todos os arquivos chegaram ao destino remoto (nome do
remoto errado, permissão de escrita negada de forma silenciosa, cota
esgotada). Confira `rclone config show` e o painel do provedor de
armazenamento escolhido.

**`scripts/restaurar.sh` parou no meio, com um erro, e a aplicação
(`app`) ficou fora do ar.** Isto é proposital, não um bug: o script para
`app` antes de tocar no banco (passo `[4/6]`) e só o coloca de volta no
ar no fim, depois de todos os passos terem terminado. Se algo falhar no
meio, é preferível que o sistema fique fora do ar até alguém investigar
do que voltar ao ar com dados possivelmente incompletos — e a cópia de
resguardo do passo `[1/6]` continua disponível, já criptografada, em
`$DESTINO/pre-restauracao_<carimbo>` se for preciso voltar ao estado
anterior manualmente (ver "Como restaurar" para o comando de
descriptografar). Leia a mensagem de erro acima no terminal, corrija
a causa e rode `sh scripts/restaurar.sh` de novo com os mesmos dois
arquivos — ou, se preferir só recolocar a aplicação no ar sem restaurar
de novo (por exemplo, se o problema era só o `db` momentaneamente fora do
ar), `docker compose --env-file .env.producao start app`.

**Depois de `scripts/restaurar.sh` terminar normalmente, a aplicação não
sobe.** Veja `docker compose --env-file .env.producao logs -f app`. O
container `db` precisa estar saudável antes do `app` voltar — confira com
`docker compose --env-file .env.producao ps`. Se o problema persistir, os
"Problemas comuns" de `docs/operacao/implantacao.md` cobrem os sintomas
mais comuns de um container `app` que não sobe.

**Preciso restaurar numa VPS nova (a antiga morreu de verdade).** Siga
`docs/operacao/implantacao.md` até o fim do Passo 7 (containers no ar,
com um banco vazio recém-criado pelo `prisma migrate deploy` e pelo
seed). Copie `/opt/lar/.senha-backup` de algum lugar seguro onde você a
tenha guardado (ver "A senha de criptografia") para o mesmo caminho na
VPS nova. Baixe os dois arquivos `.gpg` mais recentes do armazenamento
remoto (`rclone copy remoto:lar-backup/banco_....gpg .` e o mesmo para
`uploads_...`) e então rode `scripts/restaurar.sh` normalmente, como
descrito acima.

# Implantação em produção

Guia passo a passo para colocar o sistema no ar numa VPS própria, usando
Docker. Siga na ordem — cada passo depende do anterior. Comandos são para
rodar direto no terminal da VPS (via SSH), com Linux (Ubuntu/Debian nos
exemplos abaixo; noutra distribuição os comandos de instalação do Docker
e do firewall mudam, o resto é igual).

Se travar em algum passo, veja "Problemas comuns" no fim deste documento
antes de tentar de novo.

## Antes de começar

- **VPS com pelo menos 2 GB de RAM** e Linux (Ubuntu 22.04/24.04 ou
  Debian 12 são as opções mais testadas pela comunidade Docker).
- **Um domínio** apontando para esta VPS — por exemplo
  `lar.suaorganizacao.org.br`. É ele que vai receber o certificado HTTPS
  automático.
- **Acesso root (ou sudo) por SSH** à VPS.
- O **build da imagem roda na própria VPS** (o comando do Passo 7 faz
  isso). Não construa a imagem numa máquina diferente (seu notebook, por
  exemplo) e envie pronta — o sistema usa bibliotecas nativas (Argon2,
  motor do Prisma) que são compiladas para a arquitetura de processador
  de quem constrói a imagem. Construir num processador diferente do da
  VPS (ex.: Mac com chip Apple e VPS Intel/AMD) gera uma imagem que não
  funciona lá.

## Passo 1 — Apontar o DNS

No painel do seu provedor de domínio, crie um registro **A** apontando o
domínio (ex.: `lar.suaorganizacao.org.br`) para o **IP público da VPS**.
A propagação pode levar de minutos a algumas horas — confirme com:

```bash
ping lar.suaorganizacao.org.br
```

Se o IP que aparecer não for o da VPS, aguarde e tente de novo antes de
seguir — o Passo 7 depende disso para emitir o certificado HTTPS.

## Passo 2 — Liberar as portas 80 e 443 no firewall

Muitos provedores de VPS bloqueiam todas as portas por padrão, exceto a
de SSH. Sem as portas 80 (HTTP) e 443 (HTTPS) livres, o Caddy não
consegue completar a validação do Let's Encrypt e **falha ao emitir o
certificado** — de um jeito silencioso do ponto de vista de quem só
olha o navegador (a página simplesmente não abre).

Se a VPS usa `ufw` (padrão no Ubuntu):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

**Não pule o `allow OpenSSH`** (ou `allow 22/tcp`) antes do `enable` —
esquecer essa linha derruba o próprio acesso SSH à VPS.

Se a VPS estiver atrás de um firewall do próprio provedor de nuvem
(grupo de segurança, "cloud firewall", "network security group" —
comum na AWS, Lightsail, DigitalOcean, Hetzner, Azure etc.), libere as
portas 80 e 443 lá também, no painel do provedor. O `ufw` só controla o
firewall de dentro do sistema operacional; o do provedor é outra
camada, e as duas precisam estar liberadas.

## Passo 3 — Instalar o Docker

Pule este passo se `docker compose version` já funcionar na VPS.

```bash
curl -fsSL https://get.docker.com | sh
```

Este é o script oficial de instalação do Docker (inclui o Docker
Compose). Confirme ao final:

```bash
docker compose version
```

## Passo 4 — Obter o código

```bash
sudo mkdir -p /opt/lar
sudo chown "$USER" /opt/lar
git clone <URL-DO-REPOSITORIO> /opt/lar
cd /opt/lar
```

Use `/opt/lar` mesmo — os scripts de backup (`docs/operacao/backup.md`,
criados numa etapa seguinte deste projeto) assumem esse caminho por
padrão.

Daqui em diante, todo comando deste guia é rodado dentro de `/opt/lar`.

## Passo 5 — Configurar as variáveis de ambiente

```bash
cp .env.producao.example .env.producao
nano .env.producao
```

Preencha cada campo do arquivo:

| Variável | O que colocar |
|---|---|
| `DOMINIO` | O domínio do Passo 1 (ex.: `lar.suaorganizacao.org.br`) |
| `POSTGRES_USER` | Pode manter `lar` |
| `POSTGRES_PASSWORD` | Uma senha forte — gere com `openssl rand -base64 24`, por exemplo. Ninguém precisa digitar esta senha no dia a dia. |
| `POSTGRES_DB` | Pode manter `lar` |
| `AUTH_SECRET` | Ver Passo 6 |
| `SEED_ADMIN_EMAIL` | O e-mail da pessoa que vai logar pela primeira vez como Coordenação |
| `SEED_ADMIN_SENHA` | Uma senha temporária — será trocada no primeiro login (Passo 10) |

**Nunca envie este arquivo preenchido para o repositório Git.** Ele já
está listado no `.gitignore`, mas vale conferir com `git status` que
`.env.producao` não aparece como "a ser adicionado".

## Passo 6 — Gerar o AUTH_SECRET

Esta chave assina as sessões de login. Gere uma aleatória:

```bash
openssl rand -base64 32
```

Copie o resultado para `AUTH_SECRET=` dentro de `.env.producao`.

## Passo 7 — Subir os containers

```bash
docker compose --env-file .env.producao up -d --build
```

Este único comando: constrói a imagem da aplicação, sobe o banco de
dados, o proxy HTTPS, aplica as migrations do banco e cria o usuário
inicial. Na primeira vez pode levar alguns minutos (baixando as imagens
base e compilando).

> **Importante:** o comando `docker compose`, nesta VPS, **sempre**
> precisa do `--env-file .env.producao` — o arquivo não se chama `.env`
> de propósito, para não colidir com o nome que os scripts de backup
> (Tarefa 18) esperam. Sem essa opção, `docker compose` não encontra as
> variáveis (`DOMINIO`, `POSTGRES_PASSWORD` etc.) e o comando falha ou
> sobe os containers com configuração vazia. Todo comando `docker
> compose` deste guia já inclui a opção — mantenha o padrão em qualquer
> comando novo que você rodar.

## Passo 8 — Acompanhar os logs

```bash
docker compose --env-file .env.producao logs -f app
```

Espere aparecer, nesta ordem:

```
[entrypoint] Aplicando migrations...
[entrypoint] Executando seed (idempotente; não sobrescreve usuário existente)...
[entrypoint] Iniciando o servidor...
   ▲ Next.js ...
 ✓ Starting...
 ✓ Ready in ...ms
```

`✓ Ready` quer dizer que a aplicação está no ar. Saia do acompanhamento
de log com `Ctrl+C` — isso não para o container, só para de exibir o
log.

**Se aparecer `[entrypoint] AVISO: o seed falhou`**, pare aqui — veja
"A tela de login abre, mas nenhuma senha funciona" em "Problemas
comuns" antes de seguir para o Passo 9. Um servidor que sobe sem erro
não é garantia de que exista usuário para entrar.

Se a emissão do certificado HTTPS ainda não tiver terminado, veja também:

```bash
docker compose --env-file .env.producao logs -f caddy
```

## Passo 9 — Verificar o acesso

Abra `https://<seu-dominio>/login` num navegador (troque
`<seu-dominio>` pelo valor de `DOMINIO`). Deve aparecer a tela de login,
com um cadeado válido no navegador.

Se a página não abrir: confira o DNS (Passo 1), as portas 80/443
liberadas (Passo 2) e os logs do `caddy` acima. A emissão do
certificado só funciona com o domínio já apontando para o IP correto e
as portas 80 e 443 livres e alcançáveis de fora (nenhum outro serviço
nem firewall bloqueando-as).

## Passo 10 — Trocar a senha do usuário inicial (obrigatório, agora)

Faça login com `SEED_ADMIN_EMAIL` e a senha temporária de
`SEED_ADMIN_SENHA`, e troque a senha imediatamente pela tela do sistema.
O formulário pede a senha atual antes da nova: aqui, a própria temporária
do `.env.producao`.
A senha do arquivo `.env.producao` **não pode ser considerada segura**
— ela passou por texto plano num arquivo de configuração. Depois da
troca, o valor de `SEED_ADMIN_SENHA` no `.env.producao` fica obsoleto: o
seed é idempotente e nunca mais sobrescreve a senha de um usuário que já
existe, mesmo que o container reinicie ou seja reconstruído.

## Passo 11 — Cadastrar a instituição e as contas bancárias

Antes da primeira prestação de contas, e não na véspera de entregá-la.

Em **Financeiro → Cadastros**, preencha os *Dados da instituição*: razão
social, CNPJ, endereço completo, cidade, UF, órgão destinatário e os nomes do
presidente e do tesoureiro. **A exportação da prestação recusa sem eles** — é
de lá que saem a capa, o ofício de encaminhamento, os rodapés de assinatura e
a declaração de encerramento, e um documento com lacunas onde deveria haver
razão social e CNPJ não seria aceito pelo órgão.

Na mesma tela, cadastre:

- as **contas bancárias**, com o saldo inicial e a data dele — cada
  lançamento pertence a uma conta, e cada prestação cobre uma conta num mês;
- as **origens de receita**. Crie ao menos duas: uma para doação avulsa e uma
  marcada como *"exige informar o residente"*, para a contribuição. As duas
  devem ter o mesmo **rótulo na prestação** (tipicamente `Doação`): é o rótulo
  que agrupa na conciliação, e é ele que faz a contribuição de um idoso sair
  somada às demais **sem o nome dele** no documento entregue ao órgão;
- as **categorias de despesa** e os **fornecedores**.

O saldo inicial da conta é o ponto de partida da cadeia: a prestação de cada
mês herda o saldo da anterior já fechada, e a primeira delas herda deste
campo. Um saldo inicial errado se propaga por todos os meses seguintes — vale
conferi-lo contra o extrato antes de abrir a primeira prestação.

## Passo 12 — Combinar o bloqueio de tela com a equipe

Uma sessão dura 12 horas e não expira por inatividade. Um computador
destravado na sala administrativa é, até o fim do expediente, acesso de
coordenação: a ficha de qualquer residente, a trilha de auditoria, o
cadastro de funcionários.

Trocar a senha de uma conta exige a senha de quem troca, conferida com
Argon2 — então a tela deixada aberta não vale mais poder de assumir
contas alheias. Vale, ainda assim, tudo o que a sessão já podia ler.
Combine com a equipe: **bloquear a tela ao sair da mesa** (tecla Windows
+ L).

A troca de senha é auditada com o nome de quem trocou e derruba a sessão
da conta afetada — quem sofrer percebe.

## Atualizando o sistema

Sempre que houver uma nova versão do código:

```bash
cd /opt/lar
git pull
docker compose --env-file .env.producao up -d --build
```

Isso reconstrói a imagem e reinicia os containers — as migrations do
banco rodam de novo automaticamente no início do container `app` (é o
mesmo entrypoint do Passo 7). **Não existe passo manual de migration**:
rodar este comando é sempre suficiente, e esquecer de rodá-lo depois de
um `git pull` é o erro mais comum — o sintoma costuma ser a aplicação
não refletir a mudança esperada, sem nenhum erro visível.

## Parando o sistema

```bash
docker compose --env-file .env.producao down
```

Para os containers e os remove, mas **preserva os dados** — os volumes
nomeados (`lar_pgdata`, o banco; `lar_uploads`, os documentos anexados)
continuam intactos no disco. Rodar `docker compose --env-file
.env.producao up -d --build` de novo depois disso recria tudo do jeito
que estava.

```bash
docker compose --env-file .env.producao down -v
```

**Isto é diferente e destrutivo.** O `-v` apaga também os volumes —
ou seja, apaga o banco de dados inteiro e todos os documentos anexados,
sem confirmação adicional. Não existe uso rotineiro para este comando
neste sistema. Se algum dia parecer necessário rodá-lo, faça um backup
manual antes (`docs/operacao/backup.md`) e tenha certeza absoluta do
que está fazendo — não há como desfazer depois.

## Por que TZ=America/Sao_Paulo não é opcional

O `docker-compose.yml` fixa `TZ: America/Sao_Paulo` no serviço `app`.
**Não remova nem comente essa linha.**

Motivo: várias datas no código são construídas como
`new Date('2026-08-17T12:00:00')`, sem indicar o fuso horário — nesse
formato, o JavaScript interpreta a data **no fuso horário do processo**.
Num computador comum isso corresponde ao fuso configurado no sistema
operacional, mas imagens de container Linux rodam em **UTC por padrão**
a menos que algo diga o contrário.

Sem o `TZ` fixado, o filtro de período da trilha de auditoria (tela
"Auditoria") desloca até 3 horas: um evento registrado às 21h de um dia
pode aparecer como se fosse do dia seguinte, ou ficar de fora de um
filtro "hoje" que deveria incluí-lo — **sem nenhuma mensagem de erro**.
É o tipo de defeito que só é percebido quando alguém já precisou daquela
informação e não a encontrou.

Isso foi verificado localmente (Node 24, fora do container): com
`TZ=America/Sao_Paulo` definido, `new Date(...).getHours()` e o fuso
retornado por `Intl` batem com o horário de Brasília (UTC-3) mesmo sem o
pacote `tzdata` instalado no sistema — o Node já traz consigo os dados
de fuso horário. Não foi possível confirmar dentro do container Alpine
real (ver seção "O que não foi verificado" no relatório da Tarefa 17),
mas o mecanismo é o mesmo em qualquer Node 24, independente do sistema
operacional por baixo.

## Rotação dos logs

O disco da VPS é o mesmo que guarda o banco de dados e os documentos
anexados. Um log sem limite enche esse disco, e o sintoma não é "o log
encheu": é o Postgres parando de aceitar escrita e o anexo de documento
falhando, sem que nada aponte para a causa. Há duas fontes de log, e cada
uma se limita de um jeito.

**1. Os logs dos containers — já configurados, nada a fazer.**

O `docker-compose.yml` fixa, nos três serviços (`db`, `app`, `caddy`):

```yaml
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

São 30 MB por serviço (3 arquivos de 10 MB, rotacionados pelo próprio
Docker), 90 MB somando os três. Não remova esse bloco. Conferir o que
está valendo num container:

```bash
docker inspect --format '{{json .HostConfig.LogConfig}}' lar-app-1
```

**2. O log do backup — precisa de uma entrada de logrotate.**

O cron do backup (`docs/operacao/backup.md`) grava em
`/var/log/lar-backup.log`, que fica **fora** do Docker e por isso não é
coberto pelo item 1: cresce todo dia, para sempre. Crie a entrada:

```bash
sudo nano /etc/logrotate.d/lar-backup
```

Com este conteúdo:

```
/var/log/lar-backup.log {
    weekly
    rotate 12
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root adm
}
```

O que cada linha faz, e por que está aí:

- `weekly` + `rotate 12` — guarda cerca de três meses de histórico. É o
  bastante para investigar "desde quando o backup está falhando" sem
  guardar log de anos.
- `compress` e `delaycompress` — comprime as versões antigas; a mais
  recente fica sem comprimir por um ciclo, para `tail -50
  /var/log/lar-backup.log.1` continuar funcionando logo depois da
  rotação.
- `missingok` — não reclama se o arquivo ainda não existe (a primeira
  execução do backup é que o cria).
- `notifempty` — não rotaciona arquivo vazio.
- `create 0640 root adm` — recria o arquivo com as mesmas permissões
  depois de rotacionar. Sem isto, o cron do backup (que roda como root)
  perderia o arquivo para onde escreve.

Confira a sintaxe sem rotacionar nada:

```bash
sudo logrotate --debug /etc/logrotate.d/lar-backup
```

O `--debug` só simula e imprime o que faria. Se quiser forçar uma
rotação de verdade para testar, use `sudo logrotate --force
/etc/logrotate.d/lar-backup` e confira que `/var/log/lar-backup.log.1`
apareceu.

## Comandos úteis

```bash
# Ver logs de um serviço específico
docker compose --env-file .env.producao logs -f app
docker compose --env-file .env.producao logs -f db
docker compose --env-file .env.producao logs -f caddy

# Reiniciar só a aplicação (sem reconstruir a imagem)
docker compose --env-file .env.producao restart app

# Ver se os containers estão de pé
docker compose --env-file .env.producao ps

# Abrir um terminal SQL dentro do banco (leitura/inspeção manual;
# troque "lar" se você mudou POSTGRES_USER/POSTGRES_DB no .env.producao)
docker compose --env-file .env.producao exec db psql -U lar -d lar

# Abrir um terminal SQL a partir do container da aplicação (usa a
# DATABASE_URL do próprio container — aspas simples de propósito, para
# não expandir a variável no terminal da VPS, e sim dentro do container)
docker compose --env-file .env.producao exec app sh -c 'psql "$DATABASE_URL"'
```

## Problemas comuns

**A tela de login não abre, e os logs do `caddy` mostram erro de
certificado.**
Confirme que o DNS já propagou (`ping <dominio>`), que as portas 80 e
443 estão liberadas no firewall do sistema **e** no do provedor de
nuvem (Passo 2), e que nada mais na VPS está usando essas portas
(`sudo ss -tlnp | grep -E ':80|:443'` deveria mostrar só o Caddy).

**Login falha com algo sobre "UntrustedHost" nos logs do `app`.**
Confere se `DOMINIO` em `.env.producao` está correto e sem `http://` ou
`https://` na frente (só o domínio, ex.: `lar.suaorganizacao.org.br`) —
o `docker-compose.yml` já monta a URL completa a partir dele.

**A tela de login abre, mas nenhuma senha funciona.**
Procure `AVISO: o seed falhou` nos logs (`docker compose --env-file
.env.producao logs app`). Se aparecer, o usuário inicial não foi
criado — o erro logo acima dessa linha diz por quê. A causa mais
provável num primeiro deploy é o binário nativo do Argon2 não carregar
na arquitetura do servidor (ver "Antes de começar", sobre construir a
imagem na própria VPS). Este é o cenário mais caro de diagnosticar às
cegas: HTTPS funciona, a tela aparece, o banco está de pé — e o sistema
é inutilizável até o seed rodar com sucesso. Depois de corrigir a
causa, rode novamente `docker compose --env-file .env.producao up -d
--build` para o entrypoint tentar o seed de novo.

**O container `app` reinicia sem parar (`docker compose ps` mostra
"Restarting").**
Veja `docker compose --env-file .env.producao logs app` — na grande
maioria dos casos é `DATABASE_URL` incorreta (senha errada em
`.env.producao`) ou o banco (`db`) ainda não terminou de subir na
primeira vez. Espere um minuto e olhe os logs de novo.

**Depois de um `git pull`, a aplicação não parece ter mudado.**
Confirme que rodou `docker compose --env-file .env.producao up -d
--build` (com `--build`) — sem essa opção, o Compose reaproveita a
imagem antiga.

## Backup

Este documento cobre só a implantação. A rotina de backup criptografado
e o procedimento de restauração ficam em `docs/operacao/backup.md`.

**Não considere o sistema pronto para uso real (cadastro dos ~30
residentes) antes de executar o teste de restauração.** Os scripts foram
escritos e revisados, e **nunca foram executados** — a máquina de
desenvolvimento não tem Docker. O momento mais barato para o primeiro
teste é agora, contra o banco vazio recém-criado: não há dado a perder.
A tabela de execução em `backup.md` tem a linha marcada `_PENDENTE_`
esperando a data, quem executou e quanto levou.

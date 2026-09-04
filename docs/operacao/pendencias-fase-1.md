# Pendências da Fase 1

Registro do que ficou em aberto ao fechar o núcleo cadastral. Nenhum item
impede o uso do sistema; todos foram decididos com o dono do projeto e estão
aqui para não dependerem da memória de ninguém.

Os itens **2, 3, 4, 6, 7 e 8 já foram resolvidos** e continuam neste documento em vez de
sumirem dele: cada um deles reverte uma decisão que estava escrita e defendida
como deliberada, e apagar o registro apagaria junto o motivo de ela ter mudado.
Quem encontrar a decisão antiga citada em comentário, relatório de tarefa ou
revisão precisa achar aqui o que aconteceu depois.

| # | Estado | Onde se resolve |
|---|---|---|
| 1. Restauração do backup nunca executada | aberto (parcialmente verificado) | na implantação, no VPS |
| 2. Acesso negado não era auditado | resolvido | 23/08/2026 |
| 3. Trocar senha não exigia a senha de quem troca | resolvido | 23/08/2026 |
| 4. Quatro serviços sem tela | resolvido | 23/08/2026 |
| 5. `XLOOKUP` quebrado da planilha | aberto | Fase 3, por eliminação |
| 6. Seções da ficha que se fecham | resolvido | artefato de desenvolvimento, nada a corrigir |
| 7. Apagar campo opcional não apagava | resolvido | 23/08/2026 |
| 8. "Registro em conselho" na ficha do residente | resolvido | 23/08/2026 |
| 9. E2E contra o banco de desenvolvimento | aberto | aceito; nunca use esse banco como origem de dump |

## 1. O teste de restauração do backup nunca foi executado

**Situação:** `docs/operacao/backup.md` traz o procedimento de restauração e a
tabela de execução com a linha marcada `_PENDENTE_`. Os scripts
`scripts/backup.sh` e `scripts/restaurar.sh` foram escritos e revisados linha a
linha, mas **nunca rodaram** — a máquina de desenvolvimento não tem Docker, e
sem Docker não existe o volume nem o contêiner do Postgres que os scripts
manipulam.

**Por que isso importa:** a spec, na §13, exige backup **verificado**, não
backup configurado. Um backup que ninguém restaurou é uma hipótese. O erro
clássico — dump que roda todo dia e falha na hora de voltar — só aparece na
primeira restauração real.

**O que fazer, na implantação:** antes de cadastrar o primeiro residente,
executar o procedimento inteiro de `docs/operacao/backup.md` no VPS, contra o
banco vazio recém-criado. É o momento mais barato: não há dado a perder. Depois
preencher a linha da tabela com a data, quem executou e o tempo que levou.

**Parcialmente verificado em 23/08/2026, fora da VPS.** O que não depende de
Docker foi exercitado contra o Postgres 18 local e passou: a sintaxe dos dois
scripts, o parser `ler_env` nas cinco variações que ele promete tolerar, a
trava de `DESTINO_BACKUP`, o marcador de dump completo que o `backup.sh` exige,
o ciclo `gzip`→`gpg`→`gpg -d`→`gunzip -t` com as flags exatas, e — o mais
importante — `--clean --if-exists` com `ON_ERROR_STOP=1` restaurando **sobre um
banco já povoado**, que é a hipótese em que o passo [4/6] de `restaurar.sh` se
apoia e que ninguém havia executado. A tabela em `docs/operacao/backup.md`
detalha cada item.

**A metade documental foi exercitada em 04/09/2026.** A máquina de
desenvolvimento passou a ter Docker, e o que o parágrafo acima dava como nunca
tocado foi ao teste: o `tar` do volume, o ciclo de criptografia e — o que mais
importava — o bloco inteiro do passo [5/6] de `restaurar.sh`, o que esvazia o
volume e repõe. Seis arquivos voltaram byte a byte, com acento no nome e
diretório oculto incluídos, o conteúdo errado que estava lá foi removido, e o
dono terminou `1001:1001`. Rodou contra um volume descartável; o `lar_uploads`
de produção não existe nesta máquina e não foi tocado. Detalhes em
`docs/operacao/backup.md`.

**Não substitui o teste, e o item continua aberto.** O que se exercitou foram
os blocos que os scripts contêm, não os scripts de ponta a ponta. Segue sem
prova: o `pg_dump` de dentro do contêiner, o `stop`/`start app`, o `rclone`, o
cron, e o volume de produção com a aplicação escrevendo nele — que é diferente
de arquivos postos à mão.

## 2. Tentativa de acesso negada não era registrada — resolvido

**Resolvido em 23/08/2026.** O encaminhamento anterior mandava decidir, na Fase
2, entre linha de `LogAuditoria` com ação própria e log estruturado separado com
alerta por volume. Venceu a primeira, por um precedente que o registro não
citava: `LOGIN_FALHA` já existia no enum e já era gravada com `prisma` fora de
transação (`src/modules/auth/config.ts`). O projeto já tinha decidido que
tentativa falha é evento de auditoria; faltava aplicar a mesma regra ao resto.

Contra a segunda opção pesou o que existe aqui: não há coletor de log nem
alerta neste sistema, os logs do Docker são limitados em tamanho e rotacionam, e
a tela de consulta da trilha já está pronta com filtro por entidade, usuário e
período. Um log estruturado ninguém leria.

**Os dois impedimentos que estavam registrados:**

*"Exige escrita fora da transação da operação, que não existe porque a operação
não começou."* — Não era impedimento: `LOGIN_FALHA` já fazia exatamente isso.
`registrarAuditoria` aceita o cliente Prisma comum, e não só um `tx`.

*"Um script hostil geraria milhares de linhas."* — Este era real, e a solução é
o coração da correção: **não se grava uma linha por tentativa.** Grava-se na 1ª,
2ª, 4ª, 8ª tentativa de uma janela de 60 segundos que desliza a cada tentativa,
com a contagem dentro da linha. Dez mil tentativas cabem em catorze linhas, e a
magnitude — que é o sinal — continua legível. O preço assumido: entre duas
linhas, o número exato de tentativas não está na trilha, só o intervalo em que
caiu.

**Onde ficou:** dentro de `exigirPapel`. É o único ponto que vê toda negação —
Server Action, rota de API e página renderizada no servidor. Auditar nas
fronteiras cobriria as duas primeiras e deixaria de fora a terceira, que é
justamente o caso de alguém digitando na URL uma tela que o papel não alcança.

**Duas decisões de desenho que valem registro:**

`exigirPapel` **continua síncrona**, e o registro é disparado sem `await`.
Torná-la assíncrona exigiria um `await` em trinta e um pontos de chamada, e um
`await` esquecido não quebraria o build — apenas deixaria de barrar o acesso.
Falha na escrita da trilha vai para o log do servidor e não derruba a tela.

`exigirPapel` **ganhou um segundo parâmetro**, a entidade, tipada como
`EntidadeAuditada` em vez de `string`. Sem ela toda negação ficaria
indistinguível na tela, e "tentou abrir a ficha clínica" pesa diferente de
"tentou abrir a lista de usuários". A tipagem não é preciosismo: um `Papel` não
é atribuível a `EntidadeAuditada`, então quem esquecer o argumento novo quebra o
build em vez de trocar, em silêncio, quais papéis a operação aceita. De quebra,
`ROTULO_ENTIDADE` na tela de consulta virou `Record<EntidadeAuditada, string>` —
entidade nova sem rótulo agora não compila, que era exatamente o que o
comentário daquele mapa lamentava não ser possível.

**O que não é coberto:** negação que não passa por `exigirPapel`. A tela de
desligamento, por exemplo, esconde o formulário do papel SAUDE antes de chamar
serviço nenhum — não há tentativa a registrar, porque não houve tentativa.

## 3. Trocar a senha exigia só a sessão aberta — resolvido

**Resolvido em 23/08/2026.** Era o item de segurança de maior prioridade da
Fase 2, e a correção saiu do tamanho que estava previsto aqui: um campo de
senha atual no formulário, conferido com Argon2 contra o próprio `ctx`.

**O que era:** `definirSenha` exigia o papel COORDENACAO e nada mais. Como a
sessão é um JWT de 12 horas sem timeout de inatividade (`auth.config.ts`), a
coordenadora que entrava às 7h e saía para o refeitório deixava, até as 19h,
qualquer pessoa naquela mesa definir a senha de qualquer conta — inclusive uma
do papel SAUDE, que enxerga evolução clínica e laudo de grau de dependência.

**O que resolveu:** `definirSenha` recebe `senhaAtual` e a confere contra o
hash de **quem troca**, não do alvo. Estar com a sessão aberta deixa de bastar;
é preciso saber a senha.

A escolha de conferir a senha do autor, e não a do alvo, não é detalhe: a senha
inicial de uma conta recém-criada aparece em texto plano na própria tela de
usuários para quem a criou. Conferir a do alvo devolveria a fechadura a quem já
tinha a chave. O teste "confere a senha de quem troca, não a do alvo" existe
para prender essa decisão.

A conferência vem **antes** de procurar o alvo, também de propósito: quem erra
a própria senha recebe "Senha atual incorreta" mesmo passando um id
inexistente, e não descobre pela mensagem quais contas existem.

**O que não muda:** a sessão continua valendo 12 horas sem timeout, e tudo o
que ela já lia continua exposto numa tela deixada aberta. O bloqueio de tela
segue sendo instrução de implantação (Passo 12 desde a Fase 3, que inseriu o
cadastro da instituição antes dele), agora com o texto certo — ele
afirmava que a coordenação trocava senha sem digitar a própria.

## 4. Quatro serviços sem caminho de interface — resolvido

**Resolvido em 23/08/2026.** Os quatro ganharam tela, e nenhum serviço exportado
segue sem caminho a partir de `src/app` — exceto `registrarAuditoria`, que nunca
foi órfão: é infraestrutura chamada de dentro dos serviços, dentro da transação.

| Serviço | Onde ficou | O que resolve |
|---|---|---|
| `atualizarResponsavel` | ficha do residente, "Editar" por responsável | telefone novo deixa de exigir remover e recadastrar |
| `removerResponsavel` | ficha do residente, "Remover" por responsável | quem deixou de ser responsável sai da ficha |
| `excluirDocumento` | ficha do residente, "Excluir" por documento | documento anexado por engano sai sem passar pelo banco |
| `atualizarUsuario` | tela de usuários, "Editar" por linha | papel errado no cadastro se corrige sem desativar e recriar a conta |

Os dois de responsável se agravavam mutuamente — sem editar **e** sem remover, um
telefone desatualizado ficava permanente — e por isso foram tratados juntos e
primeiro.

**Três decisões que a tela obrigou a tomar:**

**A edição de responsável oferece todos os campos, inclusive os opcionais em
branco.** É o que a torna também a tela que *apaga* um telefone secundário que
deixou de existir: campo oferecido e deixado vazio chega como `null` e limpa a
coluna (pendência 7). Sem aquela correção, esta tela prometeria uma limpeza que
não aconteceria.

**Excluir documento não ganhou condição de papel própria.** `excluirDocumento`
autoriza com o mesmo `papeisQuePodemVer` que filtra a listagem, então todo
documento que a ficha mostra é um que aquele papel pode excluir. Repetir a regra
na tela seria a segunda lista de política que a pendência 8 acabou de eliminar.

**Trocar o próprio papel passou a ser recusado pelo serviço.** A tela criou um
risco que não existia: a única conta de coordenação — a situação garantida logo
depois da implantação — que se rebaixasse a SAUDE deixaria o sistema sem ninguém
capaz de abrir `/usuarios`, sem caminho de volta que não fosse o banco.
`atualizarUsuario` recusa a **mudança** de papel na própria conta (não o campo,
que o formulário manda sempre), e a tela omite o seletor na própria linha. É a
mesma família da recusa de auto-alvo que `desativarUsuario` já tinha.

**O que continua sem tela, e de propósito:** ligar usuário a funcionário
(`funcionarioId`). Não existe em lugar nenhum — nem na criação —, e um campo de
id cru seria pior que a ausência. A chave some do `FormData`, o Prisma não toca
na coluna, e o vínculo de quem já tem um é preservado a cada edição.

## 5. O `XLOOKUP` quebrado do modelo de prestação de contas

Registrado em `docs/superpowers/specs/2026-08-18-modelo-prestacao-contas.md`: a
planilha que a instituição usa hoje tem a busca de CPF/CNPJ apontando para
`#REF!`. Não é pendência do sistema — é o defeito que a Fase 3 elimina ao
resolver o dado nativamente. Está aqui para que ninguém tente "consertar a
planilha" achando que o sistema depende dela.

## 6. Seções da ficha que se fecham — artefato de desenvolvimento, não defeito

**Este item foi investigado e fechado em 21/08/2026. Fica registrado porque o
diagnóstico anterior estava errado e mandaria alguém a um refactor inútil.**

**O que se dizia:** as seções recolhíveis da ficha fechavam sozinhas ao gravar,
porque "o nó do DOM é remontado pelo React na revalidação"; o conserto indicado
era transformá-las em componentes de cliente.

**O que é, medido:** não há remontagem. Um objeto gravado em `window` antes da
ação **não existe** depois dela — e `window` sobrevive a qualquer
re-renderização do React, por mais agressiva. A página recarrega inteira. A
causa é o formulário ser enviado **antes de o React hidratar**: sem hidratação,
o navegador faz o POST nativo do HTML em vez de passar pela Server Action, e o
resultado é uma navegação de documento, que devolve tudo no estado do servidor.

**Por que nenhum usuário vive isso:** medido contra build de produção, com CPU
estrangulada em 6× e rede 3G (400 ms de latência, 400 kbps), e **espera zero**
entre carregar e enviar — nenhuma recarga, em nenhum dos casos. A janela existe
só no build de desenvolvimento, cujo bundle é ordens de grandeza maior. A suíte
E2E a encontra porque roda contra `npm run dev`; a implantação roda o standalone
de produção.

**Consequência prática:** nada a corrigir no produto. Se um dia a janela voltar
a importar, o conserto **não** é estado do React — que se perde numa recarga
exatamente como o `<details>` — e sim persistir a abertura fora dele, em
`sessionStorage`, restaurada ao montar.

**Melhoria considerada e não feita:** rodar a suíte E2E contra build de
produção, o que eliminaria o artefato e aproximaria o teste do que o usuário
recebe. Custa um `npm run build` por execução. Vale reavaliar na Fase 2A, quando
a suíte crescer — subir o servidor de produção nesta investigação já revelou uma
classe de problema que o modo de desenvolvimento não mostra (o `AUTH_TRUST_HOST`
que o `docker-compose.yml` define e o desenvolvimento dispensa).

## 7. Apagar um campo opcional não apagava nada — resolvido

**Resolvido em 23/08/2026.** Fica registrado porque a decisão contrária estava
escrita em comentário de código e defendida como deliberada; quem a encontrar
citada em outro lugar precisa saber que foi revertida de propósito.

**O que era:** os conversores de `FormData` omitiam a chave do campo vazio, para
que a trilha de auditoria parasse de registrar alterações que não aconteceram. O
Prisma ignora chave ausente, então limpar um campo opcional pela tela era
impossível: a coordenação apagava "Religião", salvava, a tela respondia
"Registro salvo.", o banco não mudava e a trilha ficava tão silenciosa quanto
ele. O problema não era a limitação — era a tela afirmar o contrário do que
acontecia.

**O que resolveu:** o `FormData` distingue, por `has()`, três estados que a Fase
1 tratava como dois. Era essa distinção que faltava, não a sentinela inventada
que se temia:

| estado do campo | vira | efeito no banco |
|---|---|---|
| ausente do formulário | `undefined` | `semIndefinidos` omite a chave; a coluna não é tocada |
| presente e vazio | `null` | grava `null` — a pessoa apagou |
| preenchido | o valor aparado | grava o valor |

Oferecer um campo na tela passa a ser o que autoriza apagá-lo. O medo registrado
na decisão anterior — "gravaria `null` em qualquer campo deixado em branco por
engano" — não se materializa: quem monta o formulário escolhe quais campos
oferece, e campo que a tela não mostra continua intocável.

**O que mudou:** `texto`, `data` e `numero` (`src/lib/formulario.ts`) devolvem os
três estados, e `semIndefinidos` preserva `null` enquanto continua removendo
`undefined`. Todo campo opcional dos schemas trocou `.optional()` por
`.nullish()` — conferido campo a campo contra `prisma/schema.prisma`: cada um dos
que agora aceitam `null` corresponde a uma coluna anulável. E `mapaErroZodPtBr`
passou a traduzir `received: 'null'` como "Campo obrigatório", porque apagar um
campo que não pode ficar vazio é erro de preenchimento, não "esperado texto,
recebido nulo".

**O que garante que continua funcionando:** `formulario.test.ts` cobre os três
estados nos três conversores; os dois `conversores.test.ts` cobrem a fronteira
que interessa (campo oferecido e em branco vira `null`; campo que a tela nem
mostrou some) e o diff que a limpeza gera; e
`residentes.service.test.ts` fecha a ponta do banco — `atualizarResidente`
recebendo `null` esvazia a coluna e registra `{ de: 'Católica', para: null }` na
auditoria. Cada um foi visto falhando contra o código anterior antes de passar.

**Sobre a confirmação da tela:** "Registro salvo." só aparece com
`estado.sucesso`, e a gravação agora de fato acontece. A mensagem deixou de
mentir por consequência, sem precisar mudar.

## 8. "Registro em conselho" na ficha do residente — resolvido

**Resolvido em 23/08/2026**, pelas duas saídas que o registro anterior apontava,
que se mostraram complementares e não alternativas: classificação própria na
política e alvo obrigatório na entrada.

**O que era:** `papeisQuePodemVer` classificava `CONSELHO_PROFISSIONAL` como
visível a todos os papéis quando não havia `funcionarioId`, e o seletor da ficha
do residente — que deriva dessa política — oferecia o tipo. Registro em conselho
é o vínculo do profissional com o órgão de classe; não existe para quem mora
aqui.

**O que resolveu:** sem `funcionarioId`, a política devolve lista vazia — ninguém
vê. `tiposQuePodeAnexar` continua derivando dela, então o tipo sai do seletor sem
que a tela ganhe exceção própria, que era a armadilha registrada aqui: a segunda
lista de política que a Fase 1 eliminou. A ordem das checagens preserva o caso
legítimo — o registro em conselho **de um funcionário** continua sendo documento
de pessoal, visível a COORDENACAO e ADMINISTRATIVO. O teste que já existia,
"concorda com `papeisQuePodemVer` para todo tipo e todo papel", é o que garante
que a tela não volte a divergir.

Como a tela não é o que autoriza, `anexoSchema` ganhou a recusa correspondente:
`CONSELHO_PROFISSIONAL` exige `funcionarioId`, e um POST montado à mão recebe
"Registro em conselho pertence ao cadastro do funcionário". Sem isso a
combinação entraria no banco escondida de todo mundo — inclusive de quem
tentasse excluí-la pela tela.

**Dado existente:** nenhum. Conferido no banco de desenvolvimento (zero
documentos `CONSELHO_PROFISSIONAL` vinculados a residente) e a produção ainda não
foi implantada. Se um dia aparecer um, ele some da listagem e do download — é a
contrapartida assumida de a política tratar a combinação como inexistente, e o
caminho para lidar com ele é o banco, não a tela.

## 9. A suíte E2E roda contra o banco de desenvolvimento e acumula registros

Está declarado no README e é aceitável em desenvolvimento, mas tem uma
consequência que precisa estar escrita: **o banco de desenvolvimento nunca pode
ser a origem de um dump para popular produção.** Ele contém residentes e
funcionários de teste, laudos repetidos e linhas de auditoria geradas por
verificação automatizada.

A implantação já cria banco vazio e roda o seed — o risco só aparece se alguém
tentar "aproveitar" os dados de desenvolvimento. Não faça.

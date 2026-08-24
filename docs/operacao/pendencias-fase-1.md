# Pendências da Fase 1

Registro do que ficou em aberto ao fechar o núcleo cadastral. Nenhum item
impede o uso do sistema; todos foram decididos com o dono do projeto e estão
aqui para não dependerem da memória de ninguém.

Os itens **6, 7 e 8 já foram resolvidos** e continuam neste documento em vez de
sumirem dele: cada um deles reverte uma decisão que estava escrita e defendida
como deliberada, e apagar o registro apagaria junto o motivo de ela ter mudado.
Quem encontrar a decisão antiga citada em comentário, relatório de tarefa ou
revisão precisa achar aqui o que aconteceu depois.

| # | Estado | Onde se resolve |
|---|---|---|
| 1. Restauração do backup nunca executada | aberto | na implantação, no VPS |
| 2. Acesso negado não é auditado | aberto | Fase 2, com a tela de auditoria |
| 3. Trocar senha não exige a senha de quem troca | aberto | Fase 2 — prioridade de segurança |
| 4. Quatro serviços sem tela | aberto | Fase 2 |
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

## 2. Nenhum serviço registra tentativa de acesso negada

**Situação:** `exigirPapel` lança `ErroPermissao` e a trilha de auditoria não
recebe nada. A auditoria registra o que **aconteceu**, não o que foi
**tentado**.

**Por que isso importa:** é a diferença entre saber que um dado foi lido e saber
que alguém tentou lê-lo repetidamente e não conseguiu. Para dado de saúde sob a
LGPD (art. 11), o segundo é o sinal que interessa.

**Por que não foi feito agora:** auditar negação dentro de `exigirPapel` exige
uma escrita fora da transação da operação (que não existe, porque a operação
não começou), e uma decisão sobre limite de volume — um script hostil geraria
milhares de linhas. É trabalho de projeto, não de correção.

**Encaminhamento:** decidir na Fase 2, junto com a tela de consulta da
auditoria, se a negação vira linha de `LogAuditoria` com ação própria ou log
estruturado separado com alerta por volume.

## 3. Trocar a senha de um usuário não exige a senha de quem troca

**Situação:** `definirSenha` exige o papel COORDENACAO e nada mais. Uma sessão
é um JWT de **12 horas sem timeout de inatividade** (`auth.config.ts`).

**Cenário concreto:** a coordenadora entra no sistema às 7h no computador da
sala administrativa e sai para o refeitório. Até as 19h, qualquer pessoa que
sente naquela mesa abre `/usuarios` e define a senha de qualquer conta —
inclusive uma do papel SAUDE, que enxerga evolução clínica e laudo de grau de
dependência.

**O que reduz a gravidade — e por que isto não trava a Fase 1:** a operação é
auditada dentro da transação, com o autor atribuído. O ataque não é silencioso:
deixa rastro no nome da coordenadora. E `definirSenha` grava `senhaAlteradaEm`,
o que derruba as sessões da conta afetada — a vítima percebe. É detecção, não
prevenção, mas muda o cálculo.

**Decisão:** fica de fora da Fase 1. A spec não exige reautenticação, e o escopo
foi fechado nas duas telas que ela exige. É, ainda assim, **o item de segurança
de maior prioridade da Fase 2** — a correção é barata (um campo de senha atual
no formulário, conferido com Argon2 contra o próprio `ctx`).

**Mitigação disponível hoje, sem código:** bloquear a tela ao sair da mesa.
Vale estar em `docs/operacao/implantacao.md` como instrução de uso, não como
recomendação genérica de segurança.

## 4. Quatro serviços permanecem sem caminho de interface

Implementados, testados e sem tela — decisão explícita do dono do projeto de
manter fora da Fase 1, porque a spec não os exige. O inventário foi conferido
percorrendo cada função exportada dos serviços e procurando referência em
`src/app` e `src/components`:

| Serviço | Onde | O que falta | Consequência hoje |
|---|---|---|---|
| `atualizarUsuario` | `auth/usuarios.service.ts` | formulário de edição de usuário | **o papel de um usuário não pode ser corrigido**; papel errado no cadastro só se resolve desativando e recriando a conta |
| `excluirDocumento` | `residents/documentos.service.ts` | botão de excluir na lista da ficha | documento anexado por engano só sai pelo banco |
| `atualizarResponsavel` | `residents/responsaveis.service.ts` | formulário de edição | telefone novo do responsável exige remover e recadastrar — o que a tela também não faz |
| `removerResponsavel` | `residents/responsaveis.service.ts` | ação de remover na lista | responsável que deixou de sê-lo continua listado |

Os dois de responsável se agravam mutuamente: sem editar **e** sem remover, um
telefone desatualizado fica permanente. Vale tratá-los juntos, e primeiro.

`registrarAuditoria` também não aparece em `src/app`, e não é órfão: é
infraestrutura chamada de dentro dos serviços, dentro da transação.

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

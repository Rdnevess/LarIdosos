# Pendências da Fase 1

Registro do que ficou em aberto ao fechar o núcleo cadastral. Nenhum item
impede o uso do sistema; todos foram decididos com o dono do projeto e estão
aqui para não dependerem da memória de ninguém.

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

## 6. Seções da ficha se fecham sozinhas depois de gravar

**Situação:** as seções recolhíveis da ficha do residente (Anotações, Documentos,
Grau de dependência) fecham sozinhas quando uma Server Action revalida a rota —
mas **só quando a ficha foi aberta por clique de link**, que é o caminho normal
de uso. Chegando por redirect ou após recarregar a página, permanecem abertas.

**Cenário concreto:** a cuidadora abre a lista, clica no nome do residente,
expande "Anotações", registra a anotação do plantão — e a seção se fecha. Para
conferir se gravou, precisa expandir de novo. Em cada anotação do dia.

**Causa, verificada:** não é o atributo `open` sendo reescrito. O nó do DOM é
**remontado** pelo React na revalidação — uma marca posta em JavaScript no
elemento antes da ação desaparece depois dela. Isso descarta os consertos
baratos: `defaultOpen` ou qualquer atributo vindo do servidor não resolveriam.

**Conserto certo:** passar as seções a componentes de cliente com estado próprio
de abertura. É refactor de tamanho médio, e por isso não entrou na tarefa de
fechamento.

**O que ainda não se sabe:** a condição exata. Em três variações testadas
(primeira visita por link, com e sem filtro, ação disparada de outra seção) a
seção **continuou aberta**. A regra é mais estreita do que "chegou por link", e
não foi isolada. Quem for consertar deve determinar isso primeiro — o conserto
por componente de cliente funciona de qualquer forma, mas sem a condição exata
não há como escrever teste que morda no caso certo.

**Nota:** o defeito é anterior à tarefa de fechamento; existe desde que as seções
recolhíveis foram criadas. Só apareceu agora porque nenhum teste até então
chegava à ficha por clique de link.

## 7. Apagar um campo opcional devolve "Registro salvo." e não apaga nada

**Situação:** a Fase 1 fechou os conversores omitindo a chave quando o campo vem
vazio, para que a trilha de auditoria parasse de registrar alterações que não
aconteceram. O efeito colateral, aceito e documentado no código: o Prisma ignora
chave ausente, então **limpar um campo opcional pela tela é impossível**.

**Cenário concreto:** a coordenação apaga "Religião" da ficha e salva. A tela
responde "Registro salvo.", o banco não muda, e a trilha não registra nada. Na
próxima vez que abrir a ficha, o valor antigo está lá.

O problema não é a limitação — é a tela **afirmar o contrário do que aconteceu**.
É assim que a equipe vai descobrir: achando que apagou.

**Encaminhamento:** resolver junto, na Fase 2, a sentinela de "limpar campo" e a
mensagem de confirmação. Enquanto não houver sentinela, a confirmação não deveria
prometer gravação que não houve.

## 8. "Registro em conselho" aparece ao anexar documento de residente

`papeisQuePodemVer` classifica `CONSELHO_PROFISSIONAL` como visível a todos os
papéis quando não há `funcionarioId` — então o seletor da ficha do residente
oferece o tipo, que só faz sentido para funcionário.

Não foi corrigido escondendo o tipo na tela de propósito: seria a segunda lista de
política, exatamente o que a Fase 1 eliminou ao fazer a tela consultar
`papeisQuePodemVer` em vez de repetir a regra. O lugar de resolver é a política —
dar ao tipo um alvo obrigatório, ou uma classificação própria.

## 9. A suíte E2E roda contra o banco de desenvolvimento e acumula registros

Está declarado no README e é aceitável em desenvolvimento, mas tem uma
consequência que precisa estar escrita: **o banco de desenvolvimento nunca pode
ser a origem de um dump para popular produção.** Ele contém residentes e
funcionários de teste, laudos repetidos e linhas de auditoria geradas por
verificação automatizada.

A implantação já cria banco vazio e roda o seed — o risco só aparece se alguém
tentar "aproveitar" os dados de desenvolvimento. Não faça.

# Fase 2A — Prontuário

Detalha, para implementação, o que `2026-08-18-lar-idosos-design.md` fixa nas
§3, §4.4, §7 e §9. Onde este documento diverge daquele, a divergência está
marcada e justificada. Onde ele apenas repete, é porque a decisão já estava
tomada e não precisa ser retomada.

**O que a 2A substitui:** o caderno de plantão. Enquanto ela não estiver
inteira, a equipe registra em dois lugares — e registrar em dois lugares é
registrar em nenhum.

## 1. As três decisões estruturais

Tomadas em 23/08/2026, com o dono do projeto.

### 1.1 O prontuário fica numa rota própria

| Rota | Papéis | Conteúdo |
|---|---|---|
| `/residentes/[id]` | os três | **Cadastral**: identificação, responsáveis, documentos, grau de dependência, anotações não-clínicas |
| `/residentes/[id]/prontuario` | COORDENACAO, SAUDE | Cabeçalho clínico, linha do tempo e as seções de registro |
| `/pendencias` | COORDENACAO, SAUDE | Exames sem resultado e consultas em aberto, de **todos** os residentes |

A alternativa era acrescentar as seções à ficha atual, escondidas do
ADMINISTRATIVO. Recusada por duas razões: a ficha passaria de doze seções
recolhíveis, e a fronteira de permissão viraria uma dúzia de condições
espalhadas em vez de uma rota inteira. Rota é a única fronteira que alguém
consegue verificar de relance.

**Consequência assumida, e ela é desconfortável:** o cabeçalho clínico —
alergias inclusive — fica fora do alcance do ADMINISTRATIVO. A §7 da spec-mãe
põe todo o prontuário fora do alcance desse papel, e alergia é prontuário. Quem
atende a portaria e recebe uma entrega de alimento não verá a restrição
alimentar do residente. Está registrado aqui porque é o tipo de decisão que se
descobre no pior momento; se for para mudar, muda-se a §7, não este documento.

### 1.2 A anotação geral fica estritamente não-clínica

`Anotacao` (Fase 1) perde as categorias `COMPORTAMENTO` e `OCORRENCIA`, que
passam a existir apenas em `AnotacaoSaude` (como `COMPORTAMENTO` e
`INTERCORRENCIA`). Sobram `VISITA_FAMILIA`, `SOCIAL`, `JURIDICO` e `OUTRO`.

Sem isso, um comportamento agitado poderia ser registrado em qualquer um dos
dois lugares, e o prontuário ficaria com metade da história. "Ocorrência" e
"intercorrência" são a mesma palavra para quem escreve às três da manhã.

**Migração:** as linhas existentes nas duas categorias removidas viram `OUTRO`.
São 16 no banco de desenvolvimento, todas geradas pelo E2E; produção ainda não
foi implantada, então não há dado real a converter. O `UPDATE` vai na migration
antes da alteração do enum, e o valor antigo é preservado no início do texto da
anotação — `[ocorrência] ` — para que a informação não se perca em ambiente
onde já houver dado.

### 1.3 Pendências cobrem exames e consultas, numa área própria

A spec-mãe nomeia a tela de "exames pendentes" e a chama de razão de ser do
módulo: exame solicitado e esquecido é o problema real em ILPI. Esquecer
acontece **entre** residentes — ninguém percebe abrindo trinta fichas —, então
a tela é institucional, não por residente.

Consulta esquecida é o mesmo problema e ganharia uma segunda tela quase
idêntica. Duas telas quase idênticas são duas telas que ninguém abre. Ficam na
mesma área, em blocos separados.

## 2. Modelo de dados

Segue a §4.4 da spec-mãe. As diferenças estão marcadas com **[novo]**.

**`CondicaoCronica`** — `residenteId`, `descricao`, `cid10?`, `dataDiagnostico?`,
`ativa`.

**`Alergia`** — `residenteId`, `agente`, `tipo` (`MEDICAMENTO` | `ALIMENTO` |
`OUTRO`), `gravidade` (`LEVE` | `MODERADA` | `GRAVE`), `reacao?`.

**`RestricaoAlimentar`** — `residenteId`, `descricao`, `ativa`.

**`AnotacaoSaude`** — `residenteId`, `categoria` (`EVOLUCAO` |
`INTERCORRENCIA` | `ALIMENTACAO` | `SONO` | `HIGIENE` | `COMPORTAMENTO` |
`QUEDA`), `turno` (`MANHA` | `TARDE` | `NOITE`), `texto`, `gravidade?`,
`conduta?`, `ocorridoEm`, `editavelAte`, `retificaAnotacaoSaudeId?`.

- **[novo]** `gravidade` usa o mesmo enum `Gravidade` de `Alergia`. A spec-mãe
  o deixa sem valores; inventar um segundo vocabulário para a mesma palavra
  seria pior que reusar.
- `ocorridoEm` é quando aconteceu, e é diferente de `criadoEm`. Quem registra
  às 6h o que houve às 3h precisa poder dizer isso, senão a linha do tempo
  mente sobre a madrugada.

**`SinalVital`** — `residenteId`, `aferidoEm`, `pressaoSistolica?`,
`pressaoDiastolica?`, `frequenciaCardiaca?`, `frequenciaRespiratoria?`,
`temperatura?`, `saturacaoO2?`, `glicemia?`, `peso?`, `observacao?`.

- Todos opcionais de propósito: quem afere só a pressão não deve ser obrigado a
  inventar uma saturação. O serviço recusa o registro em que **todos** os
  campos numéricos estão vazios — um registro sem nenhuma medida não é uma
  aferição.

**`Exame`** — `residenteId`, `tipo`, `dataSolicitacao?`, `dataRealizacao?`,
`dataResultado?`, `solicitanteNome?`, `laboratorio?`, `status` (`SOLICITADO` |
`AGENDADO` | `REALIZADO` | `RESULTADO_RECEBIDO` | `CANCELADO`),
`resumoResultado?`, `documentoId?`.

- `tipo` é texto livre: a lista de exames possíveis é longa e muda, e um enum
  incompleto forçaria "Outro" na maioria dos casos.
- `documentoId` aponta para o `Documento` da Fase 1. A política de visibilidade
  já classifica `EXAME` e `LAUDO` como clínicos, então o anexo não precisa de
  regra própria.

**`Consulta`** — `residenteId`, `dataHora`, `especialidade`, `profissional?`,
`local?`, `motivo?`, `conduta?`, `encaminhamento?`, `dataRetorno?`,
`documentoId?`, **[novo]** `status` (`AGENDADA` | `REALIZADA` | `CANCELADA`).

- **[novo]** O `status` não está na spec-mãe e é acrescentado aqui pela decisão
  1.3: sem ele não há como distinguir consulta por vir de consulta esquecida de
  consulta que não vai mais acontecer, e a área de pendências não teria o que
  mostrar. É o mesmo papel que o `status` de `Exame` já cumpre.

**`Vacina`** — `residenteId`, `imunizante`, `dose`, `dataAplicacao`, `lote?`,
`localAplicacao?`.

Convenções da §4 da spec-mãe valem para todas: `criadoEm`, `atualizadoEm`,
`criadoPorId`, exclusão lógica por `ativa`/`ativo`.

## 3. Cabeçalho clínico

O topo de `/residentes/[id]/prontuario`, sempre visível, sem clique:

1. Grau de dependência vigente (reusa `obterGrauVigente`, da Fase 1)
2. Alergias — as de gravidade `GRAVE` em destaque visual
3. Condições crônicas ativas
4. Restrições alimentares ativas
5. Última aferição de sinais vitais, com a data

A spec-mãe inclui também as medicações ativas. Esse bloco **não existe na 2A** —
chega com a 2B, e o cabeçalho é construído para receber mais um item sem
rearranjo.

## 4. Linha do tempo

Evoluções e intercorrências, sinais vitais, exames, consultas e mudanças de grau
de dependência, em fluxo cronológico único, filtrável por tipo.

**Não inclui a anotação geral.** A §9 da spec-mãe lista só o clínico, e é isso
que mantém a fronteira do ADMINISTRATIVO coerente: se a anotação geral entrasse
aqui, o mesmo dado teria dois níveis de acesso conforme a tela por onde fosse
lido.

**Implementação:** cinco consultas indexadas por `residenteId`, unidas e
ordenadas em memória. Não há tabela de índice nem `UNION` em SQL cru. Com trinta
residentes e uma janela padrão de 90 dias, o custo é irrelevante, e a alternativa
custaria a tipagem do Prisma de ponta a ponta. O dia em que isso doer é o dia de
medir antes de mudar.

**Janela padrão de 90 dias**, com filtro de período. Sem rolagem infinita: a
pergunta que a equipe faz é "o que aconteceu com ela nas últimas semanas", e uma
lista sem fim responde pior que um período explícito.

## 5. Área de pendências

Duas listas, de todos os residentes, ordenadas pela mais antiga primeiro —
porque a mais antiga é a mais esquecida.

**Exames em aberto:** `status` em `SOLICITADO`, `AGENDADO` ou `REALIZADO`.
`REALIZADO` entra de propósito: exame feito cujo resultado ninguém buscou é
exatamente o caso que o módulo existe para pegar. Sai da lista em
`RESULTADO_RECEBIDO` ou `CANCELADO`.

**Consultas em aberto:** `status` `AGENDADA`. As de data já passada aparecem
destacadas e no topo — a consulta que aconteceu e ninguém registrou é
indistinguível, para o sistema, da que foi esquecida, e as duas precisam da
mesma atenção humana.

## 6. Anotação de saúde: janela de edição e retificação

Regra R3 da spec-mãe, idêntica à da `Anotacao` da Fase 1: editável pelo autor
por 15 minutos; depois disso, só retificação vinculada à original, que nunca é
alterada.

O mecanismo já existe em `src/modules/residents/anotacoes.service.ts`. Ele será
**extraído** para ser compartilhado pelas duas entidades, não copiado. Duas
cópias da mesma regra divergem, e esta é uma regra que a fiscalização lê.

## 7. Permissões

| Entidade | Cria e edita | Lê |
|---|---|---|
| Todas as oito da 2A | COORDENACAO, SAUDE | COORDENACAO, SAUDE |

ADMINISTRATIVO não alcança nenhuma delas — nem leitura. A exceção que a §7 da
spec-mãe abre para esse papel é o grau de dependência, que é da Fase 1 e não
muda aqui.

Verificação na camada de serviço, com `exigirPapel`, e teste de recusa para
ADMINISTRATIVO em cada função exportada. A rota `/residentes/[id]/prontuario` e
a `/pendencias` somem do menu para quem não as alcança, mas quem barra é o
serviço.

## 8. Auditoria

As oito entidades entram em `EntidadeAuditada`
(`src/modules/audit/auditoria.service.ts`). Como esse tipo é uma união e a tela
de consulta usa `Record<EntidadeAuditada, string>`, cada uma **precisa** de
rótulo em português para o projeto compilar.

Toda escrita audita dentro da transação que a gravou, como na Fase 1. Toda
tentativa negada de acesso — um ADMINISTRATIVO curioso digitando a URL do
prontuário — vira linha `ACESSO_NEGADO` na trilha, pelo mecanismo já existente
em `exigirPapel`.

**Leitura de prontuário audita.** `VISUALIZAR` é registrado ao abrir
`/residentes/[id]/prontuario`, uma linha por abertura. Prontuário é dado
sensível sob o art. 11 da LGPD, e aqui a justificativa que dispensou auditoria
de leitura em `listarDocumentos` (metadado, não conteúdo) não se aplica: a tela
mostra o conteúdo clínico.

## 9. Interface

**Celular, equipe de cuidado.** O prontuário abre com três botões grandes —
*evolução*, *sinais vitais*, *intercorrência* —, cada um levando a um formulário
curto com data/hora e autor preenchidos. O quarto botão da §9, *medicação*, chega
com a 2B. Se registrar der trabalho, ninguém registra.

**Desktop.** Seções recolhíveis para o histórico completo de cada tipo, no mesmo
padrão da ficha da Fase 1.

Tudo em pt-BR, datas em `dd/mm/aaaa`, como o resto do sistema.

## 10. Testes

- Unitário por serviço, contra Postgres real, incluindo a recusa a
  ADMINISTRATIVO em cada função exportada.
- A janela de edição e a retificação de `AnotacaoSaude`, incluindo a expiração.
- A derivação da lista de pendências, com um exame em cada `status`.
- A ordenação e o filtro da linha do tempo com eventos de tipos diferentes no
  mesmo dia.
- E2E com o perfil SAUDE: registrar evolução, sinais vitais e intercorrência;
  ver o evento na linha do tempo; ver o exame aparecer e sair das pendências.
- E2E com o perfil ADMINISTRATIVO: a rota do prontuário digitada na URL é
  recusada, em pt-BR, e a recusa aparece na trilha de auditoria.

## 11. Fora de escopo

Medicação inteira (2B). Gráficos de tendência de pressão e peso — os campos
numéricos separados existem para torná-los possíveis depois, não agora.
Notificação de qualquer espécie. Tudo da Fase 3.

## 12. Questões deixadas em aberto

**O cabeçalho clínico invisível ao ADMINISTRATIVO** (§1.1). Decidido conforme a
spec-mãe, e registrado porque merece ser revisitado com a equipe antes de a 2A
entrar em uso.

**Sinais vitais fora de faixa.** O sistema não alerta sobre pressão alta nem
febre. Fazê-lo exigiria faixas de referência por residente e uma decisão
clínica sobre o que é alerta — trabalho de projeto, não de tela. Se entrar, é
depois da 2B.

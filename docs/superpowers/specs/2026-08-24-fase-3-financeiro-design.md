# Fase 3 — Financeiro e prestação de contas

Detalha, para implementação, o que `2026-08-18-lar-idosos-design.md` fixa nas
§3, §4.6, §7 e §10, e o que a análise do modelo real
(`2026-08-18-modelo-prestacao-contas.md`) já decidiu. Onde este documento
diverge, a divergência está marcada.

**O que a Fase 3 substitui:** a planilha de prestação de contas — não como
formato, que continua sendo o que o órgão recebe, mas como processo. Hoje
alguém digita linha a linha, insere linhas quando o mês estoura o teto de ~24,
reajusta fórmulas à mão, e copia o saldo do mês anterior torcendo para não
errar.

## 1. As decisões estruturais

Tomadas em 24/08/2026, com o dono do projeto.

### 1.1 A fase sai inteira

Cadastros, lançamentos, fechamento mensal, o `.xlsx`, o PDF e os relatórios
internos numa entrega só.

Dividir criaria o problema que a 2A evitou: entre a parte de registro e a de
exportação, a equipe lançaria no sistema **e** preencheria a planilha à mão.
Registrar em dois lugares é registrar em nenhum.

### 1.2 O layout do `.xlsx` é extraído do modelo real, para código

O modelo tem **109 a 117 células mescladas por folha** — o layout inteiro
depende delas. Escrever ~450 definições de merge a partir de uma descrição
textual seria trabalhar no escuro.

O arquivo real é lido **uma vez, em desenvolvimento**, e dele saem as faixas de
merge, as larguras de coluna e os rótulos fixos ("Credor", "CNPJ/CPF",
"Total"). Isso vira um módulo de layout.

**Nada sensível entra no repositório.** O modelo é um exemplo preenchido, com
fornecedores e valores reais, e `docs/convenio/` está no `.gitignore` por isso —
o repositório é público. Faixa de célula e a palavra "Credor" não são dado de
ninguém; o arquivo original continua fora do git, e o módulo gerado não carrega
uma linha de dado.

### 1.3 Prestação fechada reabre com motivo, e a reabertura fica registrada

COORDENACAO reabre informando o motivo. A reabertura vira linha na trilha de
auditoria e aparece nas observações do documento quando ele for gerado de novo.

Erro acontece, e um sistema que não deixa corrigir vira planilha paralela. O
que ele não pode permitir é o documento protocolado mudar em silêncio.

**Consequência assumida:** reabrir duas vezes sobrescreve `motivoReabertura` — só
a última justificativa fica no campo. O histórico completo está na trilha, que é
append-only. Uma tabela de reaberturas seria estrutura para um caso que talvez
nunca aconteça.

### 1.4 O documento existe uma vez, e é renderizado duas

Requisito acrescentado pelo dono do projeto: além do `.xlsx`, o sistema exporta
a prestação em **PDF**.

Um módulo monta a prestação como **estrutura abstrata** — seis partes, com suas
linhas, subtotais e textos —, e dois renderizadores finos a consomem. O
conteúdo e os cálculos existem uma vez só; o que se escreve duas vezes é a
disposição na folha, e ela é muito mais simples em PDF do que numa planilha com
109 merges.

**PDF por `pdfkit`, não por conversão do `.xlsx`.** Converter com LibreOffice ou
Chromium daria fidelidade perfeita e custaria uns 400 MB na imagem Docker mais
um subprocesso, num VPS único que este projeto tem cuidado em manter enxuto.
`pdfkit` é JavaScript puro e usa as fontes padrão do PDF, que cobrem os acentos
do português — nenhum arquivo de fonte a embarcar.

**O preço, assumido:** o PDF **não é pixel a pixel igual** ao `.xlsx`. É o mesmo
documento, com o mesmo conteúdo, na mesma ordem, desenhado para impressão e
assinatura. **O que vai ao órgão continua sendo o `.xlsx`** — o PDF serve ao
arquivo interno, à conferência e à assinatura física.

## 2. Lacunas fechadas entre os documentos anteriores

**`Lancamento` ganha `conciliado` e `conciliadoEm`.** A §10 do design geral pede
conciliação manual contra o extrato; a §4.6 não previu o campo. É lacuna entre
os dois textos, não decisão nova.

**A dependência nova é `exceljs`, mais `pdfkit`.** São as duas primeiras
dependências de produção desde a Fase 1, que tem nove. Escrever `.xlsx` com
merges e estilos à mão significaria montar OOXML, que ninguém deveria fazer.

## 3. Modelo de dados

Segue a §4.6 do design geral. As diferenças estão marcadas **[novo]**.

**`ConfiguracaoInstituicao`** — registro único: `razaoSocial`, `cnpj`,
`enderecoCompleto`, `cidade`, `uf`, `orgaoDestinatario`, `nomePresidente`,
`nomeTesoureiro`.

Alimenta a capa, o ofício, os rodapés de assinatura e a declaração de
encerramento. Sem ela, esses textos seriam constantes espalhadas pelo código de
exportação.

**`ContaBancaria`** — `banco`, `agencia`, `numeroConta`, `tipo` (`CORRENTE` |
`POUPANCA` | `APLICACAO`), `titular`, `saldoInicial`, `dataSaldoInicial`,
`prestaContas`, `ativa`.

A conta é o eixo do módulo: cada lançamento pertence a uma, e cada prestação
cobre uma conta num mês.

**`OrigemReceita`** — `nome` (uso interno), `rotuloPrestacao` (o texto que sai no
documento), `exigeResidente`, `ativa`.

A separação entre os dois campos é o ponto central do desenho de receitas. A
contribuição dos residentes é registrada como origem própria, com o residente
vinculado para o extrato individual, mas sai no documento como **"Doação"**,
somando com as demais. Nenhum nome de idoso entra na prestação.

**`CategoriaDespesa`** — `nome`, `ativa`. Lista aberta, alimentada pelo uso.

**`Fornecedor`** — `nome`, `documento`, `tipoDocumento` (`CNPJ` | `CPF`),
`telefone?`, `email?`, `ativo`. Substitui o `XLOOKUP` quebrado da planilha.

**`Lancamento`** — `natureza` (`RECEITA` | `DESPESA`), `descricao`, `valor`,
`data`, `contaBancariaId`, `status` (`PREVISTO` | `REALIZADO` | `CANCELADO`),
`prestacaoContasId?`, `documentoId?`, `motivoCancelamento?`, `observacao?`,
**[novo]** `conciliado`, **[novo]** `conciliadoEm?`.

- **Receita:** `origemReceitaId`, `residenteId?`, `pagadorNome?`,
  `pagadorDocumento?`
- **Despesa:** `fornecedorId`, `categoriaDespesaId`, `formaPagamento` (`PIX` |
  `TED` | `CHEQUE` | `DEBITO` | `OUTRO`), `numeroDocumentoFiscal?`

`prestacaoContasId` é preenchido no fechamento: é o que congela o conjunto
entregue ao órgão e impede que um lançamento posterior mude, em silêncio, um
documento já protocolado.

**`PrestacaoContas`** — `contaBancariaId`, `mesCompetencia`, `anoCompetencia`,
`saldoAnterior`, `saldoAnteriorAjustado?`, `justificativaAjuste?`,
`observacoes`, `status` (`ABERTA` | `FECHADA`), `fechadaEm?`, `fechadaPorId?`,
**[novo]** `reabertaEm?`, **[novo]** `reabertaPorId?`, **[novo]**
`motivoReabertura?`.

Única por (`contaBancariaId`, `anoCompetencia`, `mesCompetencia`).

**`ContribuicaoResidente`** — `residenteId`, `percentual`, `valorBaseBeneficio`,
`vigenciaInicio`, `vigenciaFim?`, `observacao?`.

Modelada com vigência porque a contribuição é percentual sobre o benefício
(art. 35, §2º da Lei 10.741/2003), e o benefício é reajustado todo ano. Guardar
apenas "valor da mensalidade" quebraria na primeira virada de exercício.

**Valores monetários** são `Decimal(12,2)`, como `beneficioValor` da Fase 1.
Nunca `Float`: dinheiro em ponto flutuante é erro que aparece só na soma do
fim do mês.

## 4. O documento abstrato

`src/modules/financeiro/documento-prestacao.ts` monta a prestação como
estrutura, sem saber nada de `.xlsx` nem de PDF:

```ts
export type DocumentoPrestacao = {
  capa: { razaoSocial: string; cnpj: string; endereco: string
          mesPorExtenso: string; ano: number; conta: string }
  oficio: { cidade: string; dataPorExtenso: string; orgaoDestinatario: string
            periodo: string; presidente: string; tesoureiro: string }
  despesas: { item: number; credor: string; documento: string
              formaPagamento: string; data: Date; valor: number }[]
  receitas: { item: number; origem: string; documento: string
              data: Date; valor: number }[]
  conciliacao: {
    banco: string; agencia: string; conta: string
    periodo: { de: Date; ate: Date }
    saldoAnterior: number
    recebimentosPorOrigem: { rotulo: string; valor: number }[]
    despesasDetalhadas: { credor: string; categoria: string; valor: number }[]
    totalReceitas: number; totalDespesas: number; saldoDisponivel: number
  }
  encerramento: { declaracao: string; observacoes: string
                  dataPorExtenso: string; presidente: string; tesoureiro: string }
}
```

**É aqui que os totais são calculados**, e em nenhum outro lugar. Os dois
renderizadores recebem números prontos.

### 4.1 Os textos institucionais

`src/modules/financeiro/textos-prestacao.ts` guarda o ofício da contra-capa e a
declaração do encerramento — como **modelo com substituição**, não como rótulo
fixo do layout. Os dois carregam período, número da conta e razão social;
copiados literalmente, congelariam "dezembro de 2025" em toda prestação gerada.

Três decisões sobre essa redação, tomadas em 24/08/2026:

**A primeira linha da declaração saiu.** O modelo trazia "Instrução para
Claude, aqui deve caber também anotações importante que devem ser citadas na
Prestação de Contas" — nota de trabalho de quem montou o arquivo, não parte do
documento, e que sairia impressa em toda prestação entregue ao órgão. Há teste
conferindo que ela não sobrevive em lugar nenhum.

**O que aquela nota pedia está atendido:** as observações do mês entram **acima**
da declaração. É o campo livre para justificar movimentações incomuns, valores
atípicos e esclarecimentos ao órgão. A ele se somam, automaticamente, a
justificativa de ajuste do saldo anterior e o motivo de uma reabertura, quando
houver — os dois são exatamente o que o órgão precisa ler, e depender de alguém
lembrar de copiá-los seria depender de alguém lembrar.

**"Conte Corrente" virou "Conta Corrente"**, erro de digitação sem mudança de
sentido. **"à disposição dos condôminos" ficou como está**, e é estranho:
condômino é dono de apartamento, não órgão conveniador — a frase provavelmente
veio de outro modelo. Não foi corrigida porque é a redação que o órgão já
recebeu, e mudá-la é decisão da instituição.

O agrupamento de receitas usa `OrigemReceita.rotuloPrestacao`, e não o texto
digitado: no Excel o `SUMIF` casa a descrição literal, e `"Doação "` com espaço
sobrando sai do subtotal sem avisar. Aqui o agrupamento é por chave estrangeira.

## 5. O `.xlsx`

`src/modules/financeiro/xlsx-prestacao.ts`, consumindo o documento abstrato.

**Células recebem valores calculados, nunca fórmulas.** O sistema é a fonte da
verdade dos totais, e as fórmulas do modelo são justamente a parte frágil:
somas com faixa fixa, agrupamento por texto literal, e um `XLOOKUP` de CPF/CNPJ
que já aponta para `#REF!`. O arquivo entregue fica visualmente igual e
aritmeticamente confiável.

**Datas saem como data**, não como número de série — no modelo atual aparecem
como `45995`.

**As faixas são dimensionadas pelo volume real.** O teto de ~24 linhas já foi
atingido: hoje a equipe insere linhas e reajusta fórmulas à mão.

O layout — merges, larguras, rótulos — vem do módulo extraído do modelo real
(§1.2).

## 6. O PDF

`src/modules/financeiro/pdf-prestacao.ts`, consumindo o mesmo documento
abstrato.

Seis seções, uma por página, na mesma ordem do `.xlsx`. Tabelas simples com
cabeçalho repetido quando a lista quebra de página, totais em negrito, e os
blocos de assinatura ao pé das folhas que os têm no modelo.

Fontes padrão do PDF (Helvetica), que cobrem os acentos do português. Nenhum
arquivo de fonte embarcado, nenhuma dependência de sistema.

**Não é pixel a pixel igual ao `.xlsx`, e não precisa ser.** O que vai ao órgão
é o `.xlsx`; o PDF serve ao arquivo interno, à conferência e à assinatura
física.

## 7. Fechar, reabrir e o saldo anterior

**Fechar** grava `prestacaoContasId` em todos os lançamentos `REALIZADO` da
conta na competência, marca `status = FECHADA`, `fechadaEm` e `fechadaPorId`.
Só COORDENACAO fecha — é ato institucional.

Um mês sem movimento **pode** ser fechado: prestação de saldo zero é um fato, e
exigir lançamento seria empurrar alguém a inventar um.

**Reabrir** exige motivo, grava `reabertaEm`, `reabertaPorId` e
`motivoReabertura`, e solta os lançamentos (`prestacaoContasId = null`). Só
COORDENACAO. O motivo aparece nas observações do documento regerado.

**O saldo anterior** é derivado do `saldoDisponivel` da prestação anterior
**fechada** da mesma conta. Na primeira prestação de uma conta, vem de
`ContaBancaria.saldoInicial`.

O valor é **exibido para conferência** e pode ser **ajustado com justificativa
obrigatória**, que passa a constar das observações. Se o saldo sempre fecha, o
ajuste nunca é usado e nada se perde; se diverge, a divergência fica registrada
com autor e motivo, em vez de ser sobrescrita em silêncio.

## 8. A contribuição do residente

A contribuição é percentual sobre o benefício, e o benefício está no cadastro
do residente desde a Fase 1 (`beneficioValor`).

**O sistema propõe, não lança.** Uma tela mensal lista os residentes com
contribuição vigente e o valor calculado (`percentual × valorBaseBeneficio`), e
quem confere marca as que de fato entraram — cada marca vira um `Lancamento` de
receita, com `residenteId` preenchido e a origem cuja `rotuloPrestacao` é
"Doação".

Lançar automático inventaria dinheiro que pode não ter chegado. Exigir trinta
digitações por mês faria a equipe voltar para a planilha. A proposta é o meio
que não faz nenhuma das duas coisas.

## 9. Rotas e permissões

| Rota | Papéis | Conteúdo |
|---|---|---|
| `/financeiro` | COORDENACAO, ADMINISTRATIVO | lançamentos, com filtro por conta, período e natureza |
| `/financeiro/prestacoes` | COORDENACAO, ADMINISTRATIVO | por conta e competência; fechar, reabrir, exportar |
| `/financeiro/contribuicoes` | COORDENACAO, ADMINISTRATIVO | a proposta mensal da §8: quem tem contribuição vigente, o valor calculado, e o que já virou lançamento |
| `/financeiro/cadastros` | COORDENACAO, ADMINISTRATIVO | contas, fornecedores, origens, categorias, instituição |
| `/residentes/[id]` | os três | contribuição vigente — é dado do residente |

**SAUDE não alcança nada do financeiro.** É a fronteira espelhada da 2A: lá o
administrativo não vê prontuário; aqui a saúde não vê dinheiro.

**Fechar e reabrir são só de COORDENACAO.** Os demais atos aceitam também
ADMINISTRATIVO, que é quem monta a prestação no dia a dia.

## 10. Auditoria

As oito entidades entram em `EntidadeAuditada`, e o typecheck exige rótulo em
português para cada uma antes de o projeto compilar.

**Gerar o `.xlsx` ou o PDF audita `EXPORTAR`** — a ação já existe no enum desde
a Fase 1 e nunca tinha sido usada. É o registro de que um documento saiu do
sistema, com quem o gerou e quando.

Fechar e reabrir auditam `ATUALIZAR` com o diff do status; a reabertura carrega
o motivo no diff.

## 11. Testes

- **`documento-prestacao.ts` sem banco:** os totais, o agrupamento de receitas
  por rótulo, o saldo disponível, e o caso do mês sem movimento.
- **O `.xlsx` gerado é reaberto e conferido:** as seis folhas existem, os
  rótulos de cabeçalho estão nas células esperadas, os totais batem com o
  documento abstrato, as datas são data e não número, e a folha de despesas
  cresce além de 24 linhas quando o mês tem mais lançamentos.
- **O PDF gerado abre e tem as seis seções**, conferindo o texto extraído.
- Unitário por serviço, contra Postgres real, com recusa a SAUDE em cada função
  exportada.
- Fechar congela os lançamentos; reabrir os solta e exige motivo.
- O saldo anterior derivado da prestação anterior fechada, e o da primeira
  prestação vindo do saldo inicial da conta.
- O ajuste do saldo exigindo justificativa.
- E2E com o perfil ADMINISTRATIVO: lançar receita e despesa, fechar a
  prestação, baixar o `.xlsx` e o PDF pelo endpoint autenticado.
- E2E com o perfil SAUDE: `/financeiro` digitada na URL é recusada em pt-BR, e
  a recusa aparece na trilha.

## 12. Fora de escopo

Importação de OFX — cada banco tem sua peculiaridade de formato, e isso é
projeto próprio. Portal do órgão, que não existe. Plano de trabalho com
rubricas, que saiu do desenho quando o modelo real chegou. Conciliação
automática. Emissão de recibo.

## 13. Questões deixadas em aberto

**A fidelidade do `.xlsx` só se confirma abrindo os dois lado a lado.** O layout
é extraído do modelo real, mas nenhum teste automatizado compara o arquivo
gerado com o original — comparar `.xlsx` byte a byte não diz nada útil. A
primeira prestação real precisa ser conferida por alguém, contra o modelo,
antes de ir ao órgão.

**O PDF não é pixel a pixel igual ao `.xlsx`** (§1.4). Se algum dia o órgão
passar a exigir PDF, esta decisão precisa ser revista — e o caminho seria a
conversão por LibreOffice, com o custo de imagem que ela traz.

**Categorias de despesa são lista aberta.** Não há lista fechada acordada com o
órgão, e a conciliação as usa como texto. Duas categorias com o mesmo
significado e nomes diferentes ("Energia" e "Luz") aparecem como dois grupos.
Se isso incomodar, o conserto é uma tela de fusão de categorias — não uma lista
fechada, que a instituição não tem.

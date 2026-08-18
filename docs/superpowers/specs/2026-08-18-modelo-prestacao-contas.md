# Modelo de Prestação de Contas — análise estrutural

**Data:** 2026-08-18
**Origem:** modelo real fornecido pela instituição (`docs/convenio/`, fora do controle de versão)
**Status:** analisado; alimenta o redesenho da Fase 3

Este documento descreve a **estrutura** do modelo exigido pelo órgão conveniador. Os arquivos originais ficam em `docs/convenio/`, ignorado pelo git.

## 1. Fatos que mudam o design da Fase 3

| Fato | Consequência |
|---|---|
| **Não há plano de trabalho nem rubricas.** São despesas gerais recorrentes. | `RubricaPlanoTrabalho` **sai do modelo**. A classificação passa a ser a **categoria de despesa**, que o modelo usa na aba de conciliação. |
| **Uma prestação por conta bancária, por mês.** | `PrestacaoContas` vira **entidade própria** (competência + conta), não um relatório gerado sob demanda. Várias prestações coexistem no mesmo mês. |
| **A prestação não contém dados de idosos.** | O módulo financeiro não precisa de vínculo com residente para gerar o documento. O vínculo permanece só para controle interno da contribuição. |
| **O órgão aceita o próprio modelo.** | A exportação precisa gerar o **`.xlsx` no formato exato**, não um relatório livre. |
| **Cabeçalhos, assinaturas e textos são fixos por instituição.** | Nasce `ConfiguracaoInstituicao`: razão social, CNPJ, endereço, cidade/UF, nome do presidente e do tesoureiro. |
| **A conciliação agrupa receitas por descrição** (`SUMIF` por texto exato: "Doação", "Repasse Prefeitura", "Rendimentos Aplicação Financeira"). | Receita precisa de **origem padronizada**, não texto livre — no Excel, um erro de digitação silenciosamente zera o grupo. |
| **Credor tem CPF/CNPJ resolvido por `XLOOKUP`** contra uma lista auxiliar (hoje quebrada, `#REF!`). | Confirma a entidade `Fornecedor` (nome + documento). O sistema resolve isso nativamente, e o defeito da planilha deixa de existir. |
| **Saldo anterior abre a conciliação.** | Deve ser derivado do saldo final da prestação anterior **da mesma conta**, não digitado de novo. |

## 2. Estrutura do arquivo (6 abas)

### 1-Capa
Razão social; CNPJ e endereço; título "PRESTAÇÃO DE CONTAS"; **mês** e **ano** por extenso; identificação da **conta corrente**.

### 2-Contra-Capa
Ofício de encaminhamento: cidade e data por extenso, assunto, texto institucional padrão citando o período de referência, e assinaturas de **Presidente** e **Tesoureiro**.

### 3-Despesas
Colunas: `Item` (sequencial) · `Credor` · `CNPJ/CPF` · `CH/OB` (forma de pagamento: PIX, TED, cheque, ou `-`) · `Data` · `Valor (R$)`.
Rodapé com **Total** e assinaturas.

### 4-Receitas
Colunas: `Item` · `Credor` (na prática, a **origem**: Doação, Repasse Prefeitura, Rendimentos de Aplicação Financeira) · `CNPJ/CPF` · `Data` · `Valor (R$)`.
Rodapé com **Total** e assinaturas.

### 5-Conciliação
Dados bancários (banco, agência, conta); período `dd/mm/aaaa a dd/mm/aaaa`; e o demonstrativo:

```
Saldo Anterior
(+) Recebimentos          — subtotal por origem
= Total de Saldo + Receitas
(−) Despesas              — linha a linha: Credor · Categoria · Valor
= Total de Despesas
= Saldo Disponível
```

**A categoria da despesa aparece só aqui**, não na aba 3. Categorias observadas no exemplo: Salário, Diária, Prestação de Serviços de terceiros, Peça para conserto, Serviço (reforma), Taxa bancária, Energia, Água e Esgoto, Compra de móveis.

### 6-Encerramento
Declaração de guarda e conservação dos documentos contábeis, citando conta e mês, mais um **campo livre para observações e justificativas** (valores atípicos, esclarecimentos) — requisito indicado pela instituição no próprio modelo. Data e assinaturas.

## 3. Limitações do modelo em planilha que o sistema elimina

- **Teto de linhas.** As abas de despesas e receitas têm faixa fixa (até a linha 34, ~24 lançamentos). Um mês mais movimentado não cabe sem mexer nas fórmulas à mão.
- **Agrupamento por texto.** O `SUMIF` da conciliação casa a descrição literal; "Doação " com espaço sobrando sai do grupo sem aviso.
- **Busca de documento quebrada.** O `XLOOKUP` de CPF/CNPJ aponta para `#REF!` — a lista auxiliar se perdeu em alguma cópia do arquivo.
- **Datas como número de série.** Aparecem como `45995` na origem; a exportação grava data real formatada.
- **Recontagem manual do saldo anterior**, que hoje depende de alguém copiar o saldo final do mês anterior sem errar.

## 4. Pendências de informação

Registradas para confirmação com a instituição:

1. A contribuição dos residentes (percentual do benefício) entra nesta prestação como receita, ou é controlada à parte?
2. Volume mensal típico de lançamentos por conta — o teto de ~24 linhas já foi atingido alguma vez?
3. As categorias de despesa são uma lista fechada acordada com o órgão, ou livres?
4. Quantas contas bancárias, e todas prestam contas ao mesmo órgão?
5. O saldo anterior confere sempre com o extrato, ou há ajustes manuais entre um mês e outro?

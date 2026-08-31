# Anexos comprobatórios na prestação de contas — design

Hoje a prestação sai como seis folhas de números: capa, ofício, despesas,
recebimentos, conciliação e encerramento. **A papelada que comprova esses
números não está no sistema.** A nota fiscal, o comprovante de pagamento e o
extrato bancário circulam por fora — pasta, e-mail, mensagem — e são juntados à
mão ao que o órgão recebe.

Este documento decide como eles passam a viver no sistema e a sair no mesmo PDF.

## 1. O que este documento decide

| Decisão | Quem decidiu |
|---|---|
| Duas notas por despesa: documento fiscal e comprovante de pagamento | o dono do projeto, 31/08/2026 |
| Um extrato bancário por conta, por período | o dono do projeto, 31/08/2026 |
| Só em despesa — receita não tem esses campos | o dono do projeto, 31/08/2026 |
| Só `.pdf`; foto de celular é recusada | o dono do projeto, 31/08/2026 |
| Anexos entram **só na exportação em PDF** | o dono do projeto, 31/08/2026 |
| Concatenação pura: sem carimbo, sem folha de rosto | o dono do projeto, 31/08/2026 |
| Anexo faltando é pulado em silêncio | o dono do projeto, 31/08/2026 |
| Anexos seguem a trava do fechamento | o dono do projeto, 31/08/2026 |
| `pdf-lib` para juntar; o `pdfkit` continua desenhando | este documento |
| O `documentoId` órfão vira `documentoFiscalId` | este documento |
| Dois valores novos no `TipoDocumento`, restritos | este documento |
| Arquivo ilegível também é pulado | este documento |
| A cobertura aparece na tela, antes de fechar | este documento |

## 2. O que entra no PDF, e em que ordem

As seis folhas de hoje, intocadas, e depois o apêndice:

```
1-Capa
2-Contra-Capa
3-Despesas
4-Receitas
5-Conciliação
6-Encerramento
— documento fiscal da despesa 1
— comprovante de pagamento da despesa 1
— documento fiscal da despesa 2
— comprovante de pagamento da despesa 2
…
— extrato bancário
```

**A ordem das despesas é a da folha 3-Despesas** — `data` crescente, com `id`
como desempate (`documento-prestacao.ts:167`). Isso não é detalhe: é o que faz a
enésima despesa da tabela ser a enésima do apêndice, e é o único índice que o
apêndice tem.

**Nada é carimbado, nada é redimensionado, nada ganha folha de rosto.** Cada
anexo entra com todas as suas páginas, exatamente como foi enviado. Foi decisão
explícita: o documento original chega ao órgão sem uma marca do sistema em cima.

O preço, registrado aqui para não ser descoberto depois: **a página não diz de
quem ela é.** Quem folhear o apêndice de uma prestação com anexos faltando não
distingue "a despesa 3 veio sem nota" de "a despesa 3 não existe" — vê menos
páginas, e a contagem deixa de bater com a numeração da tabela. É por isso que a
§7.2 põe a cobertura na tela: o conserto acontece antes de gerar, porque dentro
do documento ele não cabe.

**Só o PDF muda.** O `.xlsx` e o CSV do contador continuam exatamente o que são
hoje — o `.xlsx` porque o modelo do órgão tem seis abas e não comporta anexo, e o
CSV porque é uma listagem plana para importação.

## 3. Modelo de dados

```prisma
model Lancamento {
  documentoFiscalId       String?
  documentoFiscal         Documento? @relation("LancamentoDocumentoFiscal", ...)
  comprovantePagamentoId  String?
  comprovantePagamento    Documento? @relation("LancamentoComprovantePagamento", ...)
}

model PrestacaoContas {
  extratoId  String?
  extrato    Documento? @relation("PrestacaoExtrato", ...)
}
```

Três relações nomeadas, porque `Documento` passa a ter mais de uma ligação com
`Lancamento` e o Prisma exige nome quando há ambiguidade.

### 3.1 O `documentoId` órfão vira `documentoFiscalId`

`Lancamento.documentoId` **já existe**. O `lancamentos.service.ts` o aceita no
schema de entrada, e **nenhuma tela do sistema jamais o envia** — o único upload
que existe é o da ficha do residente. É um slot pronto e nunca usado, e o tipo
natural dele no enum é literalmente `COMPROVANTE_FISCAL`.

Renomear, em vez de acrescentar dois campos e deixar o terceiro morto ao lado
deles com o mesmo papel. A migração é um `RENAME COLUMN`, e não há dado a
preservar porque não há dado.

**Alternativa recusada:** tabela de junção com papel
(`AnexoLancamento { lancamentoId, documentoId, papel }`), que permitiria N anexos
por papel. Recusada por YAGNI — o pedido é de dois campos separados, e a junção
cobra código hoje por flexibilidade que ninguém pediu. Se um dia uma despesa
precisar de três notas, migrar para a junção custa o mesmo que custaria agora.

### 3.2 Por que o extrato pendura na prestação

Uma `PrestacaoContas` **é** um par (conta bancária, mês/ano) — exatamente a
granularidade pedida, "em cada período e para cada conta". Não há modelo
intermediário a inventar: o extrato de agosto da conta X é um campo da prestação
de agosto da conta X.

### 3.3 Só despesa

Os dois campos ficam na tabela `lancamentos`, que guarda receita e despesa. A
restrição é do serviço, e não do schema: gravar `documentoFiscalId` ou
`comprovantePagamentoId` num lançamento de `natureza = RECEITA` é recusado com
`ErroValidacao`, e há teste de recusa — convenção do projeto, em que toda regra
tem o seu caso negativo.

A tela nem oferece: os campos de anexo só aparecem na linha de uma despesa.

## 4. Visibilidade — a armadilha do enum

Esta seção existe porque o achado quase passou despercebido, e é de segurança.

`papeisQuePodemVer`, em `src/modules/residents/documentos.service.ts`, decide
quem enxerga um documento **pelo tipo**, com um atalho por `funcionarioId` antes
de tudo. O último `return` da função é `TODOS`. Um documento de tipo novo, sem
regra própria, **fica visível a todos os papéis** — e um extrato bancário é
provavelmente o documento mais sensível que este sistema vai guardar.

Entram dois valores no `TipoDocumento`:

| Tipo | Quem vê |
|---|---|
| `COMPROVANTE_FISCAL` (já existe) | `FINANCEIRO_E_PESSOAL` |
| `COMPROVANTE_PAGAMENTO` | `FINANCEIRO_E_PESSOAL` |
| `EXTRATO_BANCARIO` | `FINANCEIRO_E_PESSOAL` |

### 4.1 O efeito colateral no seletor da ficha

`tiposQuePodeAnexar` **deriva** de `papeisQuePodemVer` — de propósito, para não
existirem duas listas de permissão que divergem — e é ela que monta o seletor de
"Tipo de documento" na ficha do residente.

Consequência direta: acrescentar `EXTRATO_BANCARIO` ao enum, sozinho, passa a
oferecer **"Extrato bancário" como anexo de um residente**. É absurdo, e nenhuma
regra atual impede.

A barreira: os dois tipos novos são **de lançamento e de prestação, nunca de
alvo**. O `anexoSchema`, que grava anexo de residente e de funcionário, os recusa
— como já recusa `CONSELHO_PROFISSIONAL` para residente — e `tiposQuePodeAnexar`
os exclui do seletor. Com teste, porque a derivação é justamente o que tornaria o
erro silencioso.

`ROTULO_TIPO_DOCUMENTO`, em `src/lib/ptbr.ts`, é um
`Record<TipoDocumento, string>`: os dois tipos novos sem rótulo quebram o
typecheck. Essa guarda já existe e funciona sozinha.

## 5. Onde se anexa, e quando não se pode mais

| Anexo | Tela | Onde |
|---|---|---|
| Documento fiscal | `/financeiro` | na linha da despesa |
| Comprovante de pagamento | `/financeiro` | na linha da despesa |
| Extrato bancário | `/financeiro/prestacoes` | no cartão da prestação |

Papéis: `COORDENACAO` e `ADMINISTRATIVO`, os mesmos que já alcançam o
financeiro. A fronteira de papéis não se mexe.

### 5.1 Só PDF

`salvarArquivo` aceita PDF, JPG, PNG e WEBP. Estes três campos aceitam **só
`application/pdf`**, recusado com mensagem na tela: "Envie o arquivo em PDF."

Foi decisão explícita, com a alternativa na mesa: aceitar foto de celular e
embuti-la como página A4 na montagem, o que o `pdf-lib` faz sem dependência
adicional. Ficou de fora para manter a montagem uma concatenação e nada mais.

**Como saber se deu errado:** se a equipe passar a converter foto à mão antes de
enviar, ou se os campos ficarem vazios enquanto a papelada continua circulando
por fora, a conversão volta à mesa — com uso real, e não com suposição.

### 5.2 A trava do fechamento

Fechar a prestação hoje congela os lançamentos realizados da competência: "o
documento entregue ao órgão para de mudar sozinho". **Os anexos entram na mesma
trava.** Com a prestação `FECHADA`, anexar, trocar ou remover qualquer um dos
três é recusado.

Uma regra só, e não duas. Na prática significa *não feche agosto antes do extrato
de agosto chegar* — que é prática contábil normal, e não limitação inventada
aqui. Se ainda assim for preciso mudar depois, a reabertura já existe, exige
motivo e o imprime nas observações do documento regerado.

**Alternativa recusada:** deixar só o extrato fora da trava, já que por natureza
ele chega depois do mês fechar. Recusada porque criaria duas semânticas de
"fechada" — uma para lançamento, outra para anexo — e porque "fechada" deixaria
de garantir que o PDF parou de mudar, que é a única coisa que a palavra promete
hoje.

## 6. A montagem: por que o `pdfkit` não basta

**O `pdfkit` desenha PDF do zero e não sabe importar páginas de outro PDF.** Não
é limitação de configuração: a API não existe. O gerador atual,
`pdf-prestacao.ts`, escreve as seis folhas página a página e está testado assim.

Entra o **`pdf-lib`** — JavaScript puro, sem binário nativo — usado **só para
juntar**:

1. `gerarPdfPrestacao` devolve o buffer das seis folhas, como hoje;
2. um módulo novo, `anexos-prestacao.ts`, carrega esse buffer e os anexos e copia
   as páginas na ordem da §2;
3. o resultado é o que a rota `/api/prestacoes/[id]/pdf` entrega.

O `pdfkit` e os testes dele não são tocados. Sem anexo nenhum, a saída é idêntica
à de hoje — e há teste prendendo isso.

**Alternativas recusadas:** reescrever o gerador inteiro em `pdf-lib`, que joga
fora código testado e funcionando; e um conversor nativo como Ghostscript ou
qpdf, que é exatamente o que a pendência 2 da Fase 3 recusou ao aceitar que o PDF
não fosse pixel a pixel igual ao `.xlsx` — "não se resolve sem 400 MB de
conversor".

## 7. O que é pulado, e o que se vê antes

### 7.1 Pular em silêncio

**Gerar a prestação nunca falha por causa de anexo.** Sem alerta, sem erro, sem
página de aviso. O item ausente não entra, e a montagem segue para o próximo.

A regra vale para três situações, e não só para a que foi pedida:

| Situação | O que acontece |
|---|---|
| Campo vazio no banco | pula |
| Registro existe, arquivo sumiu do volume | pula |
| Arquivo existe, mas o PDF não abre | pula |

As duas últimas são extensão deste documento, pelo mesmo motivo da primeira: um
arquivo corrompido derrubaria a geração tanto quanto um ausente, e a instrução
foi que a geração não falhe. **Cada pulo vai para o log do servidor**, com o id
da prestação e o do documento — silencioso para quem usa, não para quem
investiga.

### 7.2 A cobertura, na tela

Fora do documento, e antes de fechar, o cartão da prestação mostra o que tem e o
que falta:

> 3 de 5 despesas com documento fiscal · 4 de 5 com comprovante · extrato anexado

Não é alerta e não é erro: é contagem, no único momento em que ainda dá para
resolver. Existe porque a concatenação sem rótulo da §2 torna a falta invisível
dos dois lados — no documento, porque nada identifica a página; e na tela, porque
até aqui ninguém contava.

## 8. Testes

**Montador** (`anexos-prestacao.test.ts`), com PDFs de verdade gerados no próprio
teste:

- ordem: fiscal e comprovante de cada despesa, na ordem da folha 3-Despesas, e o
  extrato por último;
- anexo com várias páginas entra inteiro;
- campo vazio pula, e o que vem depois não sai do lugar;
- arquivo ausente do volume pula;
- PDF ilegível pula;
- **sem anexo nenhum, a saída tem exatamente as seis páginas de hoje** — é o
  teste que impede a mudança de vazar para quem não anexa nada.

**Serviço:**

- recusa gravar anexo em lançamento de natureza `RECEITA`;
- recusa anexar, trocar e remover com a prestação `FECHADA`;
- recusa arquivo que não seja `application/pdf`;
- papel sem acesso ao financeiro é recusado, e a recusa vira `ACESSO_NEGADO` na
  trilha — convenção do projeto.

**Visibilidade:**

- `EXTRATO_BANCARIO` e `COMPROVANTE_PAGAMENTO` não aparecem no seletor da ficha
  do residente;
- `anexoSchema` recusa os dois como anexo de residente e de funcionário;
- o papel `SAUDE` não enxerga nenhum dos três tipos financeiros.

**Ponta a ponta:** anexar nota e comprovante numa despesa, ver a cobertura no
cartão, fechar a prestação, baixar o PDF e conferir a contagem de páginas.

## 9. Fora de escopo

- **Anexo no `.xlsx` e no CSV.** O modelo do órgão tem seis abas e não comporta
  anexo; o CSV é listagem plana para o contador importar.
- **Foto de celular.** Ver §5.1, com a condição de volta escrita.
- **Mais de um anexo por papel.** Ver §3.1.
- **Anexo em receita.** Ver §3.3.
- **Carimbo, folha de rosto ou índice do apêndice.** Ver §2.
- **Conferir o conteúdo do PDF** — saber se a nota anexada é mesmo do valor
  lançado. É trabalho de quem confere, e o sistema não tem como saber.

## 10. O que fica em aberto, de propósito

**O volume de backup fica bem mais pesado.** Estes arquivos vão para o mesmo
`lar_uploads` do anexo de residente. A pendência 1 da Fase 1 registra que a
metade documental do backup **nunca foi exercitada** — nem no VPS, nem na
verificação parcial de 23/08/2026, que cobriu só o que não dependia de Docker.
Uma dúzia de notas por mês, mais extratos, tornam essa metade a maior parte do
que o backup protege. Não é tarefa deste documento; é razão a mais para o teste
de restauração deixar de ser hipótese.

**Ninguém confere se o PDF anexado é o que diz ser.** Um comprovante enviado no
campo do documento fiscal entra no apêndice na posição do documento fiscal, e o
sistema não tem como notar. A §7.2 mostra que *há* um arquivo, nunca que ele é o
arquivo certo.

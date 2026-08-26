# Identidade visual: a marca do Lar Dona Francisca no sistema

**Data:** 2026-08-25
**Status:** Design aprovado, aguardando plano de implementação

## 1. Contexto e objetivo

O sistema funciona e está sem desenho. Não é uma opinião de gosto — é o que o código mostra:

- **A fonte é baixada e jogada fora.** `src/app/layout.tsx` carrega Geist Sans e Geist Mono pelo `next/font`, o `globals.css` as expõe em `@theme inline` como `--font-sans` e `--font-mono`, e então `body { font-family: Arial, Helvetica, sans-serif }` atropela tudo. A aplicação paga o download da Geist e renderiza em Arial. É sobra do template inicial do Next.
- **Não há um único ícone.** Nenhum `<svg>` em `src/`. Os cinco SVGs que existiam em `public/` eram do template e foram removidos em 25/08.
- **Não há camada de primitivos.** Nenhum `Botao`, `Cartao`, `Etiqueta`. Os 15 componentes são formulários e widgets de domínio; todo o resto é classe utilitária escrita à mão na tela.
- **Não há hierarquia tipográfica.** `text-sm` aparece **155 vezes**; `text-lg`, 26. A tela inteira fala no mesmo tom de voz.
- **O sistema tem o nome errado.** O `<title>` e o cabeçalho dizem "Lar de Idosos". O Lar se chama **Dona Francisca**.

### Objetivo

Que o sistema pareça o Lar Dona Francisca, e que quem o usa no corredor consiga lê-lo.

### Critérios de sucesso

- A identidade do Lar é reconhecível na primeira tela, sem precisar da logo para isso.
- No celular, o texto corrente tem 16px e nenhum alvo de toque é menor que 44px.
- No desktop, a tabela de auditoria e a de lançamentos continuam densas — a §9 do design-mãe promete isso, e quem confere duzentos lançamentos depende disso.
- Todo par texto/fundo continua atingindo 4,5:1 nos dois temas, provado pelo teste que já existe.
- Nenhuma cor crua volta ao markup: a guarda de `tests/tema.test.ts` continua verde.

### Fora de escopo

Redesenhar fluxo, mexer em quais telas existem, ou mudar o que cada uma faz. Isto é sobre como o sistema se apresenta, não sobre o que ele faz.

## 2. A identidade, medida e não estimada

A marca chegou como imagens (`exemplo/`, fora do versionamento — ver §8). As cores abaixo foram **extraídas dos pixels**, não escolhidas a olho: um script leu os arquivos com `sharp`, descartou o que tinha saturação abaixo de 0,3 e agrupou o resto em caixas de 16 níveis por canal, para que ruído de compressão JPEG não contasse como cor distinta.

### 2.1 A logo principal

Uma casa — telhado e chaminé — com uma fita que forma coração e infinito ao mesmo tempo, e o casal de idosos dentro. Abaixo, o wordmark "Lar Dona Francisca" em itálico de pincel.

| Papel na logo | Hex medido | Pixels | Contraste sobre branco |
|---|---|---|---|
| Fita, coração e wordmark | `#165c99` | 66.625 | **6,94:1** |
| Telhado, chaminé e silhuetas | `#0b3e6f` | 46.847 | **10,86:1** |

**Os dois passam AA como texto sobre branco.** Isso não era garantido e muda o custo do trabalho: a cor da marca pode ser a cor de ação e de link sem nenhum ajuste, o que raramente acontece.

**A logo principal não tem dourado.**

### 2.2 Os selos de categoria

Um sistema secundário — "Ações Solidárias", "Doações", "Parceiros do Lar", "Atividades", "Nossos Idosos" — em selos circulares: anel dourado, miolo creme, onda marinha embaixo.

| Papel | Hex medido | Contraste sobre branco |
|---|---|---|
| Anel e detalhes | `#ae9050` … `#bc9541` | **2,64:1 a 3,04:1** |
| Creme do miolo | `#fdfaf7` | — |

**O dourado reprova AA em todas as amostras**, sobre branco e sobre o marinho. Escurecê-lo até 4,5:1 leva a algo em torno de `#7a5f1e`, que já não lê como o dourado dos selos — vira bronze.

### 2.3 A ressalva sobre precisão

Os arquivos de origem são JPEG comprimido; o de melhor qualidade tem 119 KB. Os valores acima são **aproximações fiéis à direção**, não a especificação final da marca. Quando chegarem os arquivos vetoriais, os hexes são reconferidos e o `globals.css` ajustado — a estrutura de tokens não muda, só os valores.

## 3. A regra do dourado

O dourado entra **como detalhe pontual, nunca como texto e nunca espalhado**.

| Onde pode | Onde não pode |
|---|---|
| Filete sob o cabeçalho | Texto de qualquer tamanho |
| Anel ou moldura da marca | Fundo de caixa de aviso |
| Divisor de seção, usado com parcimônia | Botão, etiqueta, link |

Três razões, e a terceira é a que decide:

1. **Acessibilidade.** Como texto ele reprova, e o teste de contraste barraria.
2. **Fidelidade.** A logo principal não o usa. Espalhá-lo pelo sistema tornaria o produto *menos* parecido com a marca, não mais.
3. **Semântica.** O sistema já tem uma família âmbar que significa "atenção" — caixa de aviso, etiqueta de prestação aberta, filete do mapa do turno. Dourado e âmbar lado a lado numa tela de plantão são a mesma cor para quem passa os olhos. Restringindo o dourado a filete e anel, os dois nunca disputam o mesmo papel.

**Consequência que economiza trabalho:** os seis tokens de âmbar **não mudam**. A reafinação que a alternativa exigiria — e o reteste de contraste dela nos dois temas — deixa de ser necessária.

## 4. A paleta em tokens

O sistema já tem 26 tokens semânticos (`--cor-*`) em três blocos, com `@theme inline` e teste de contraste que lê o próprio CSS. **Esta mudança é quase toda troca de valor**, e não markup novo: nenhuma das 31 telas precisa ser repintada de novo.

### 4.1 Tokens que mudam de valor

| Token | Hoje (claro) | Passa a ser | Por quê |
|---|---|---|---|
| `--cor-acao` | `#1e293b` slate-800 | `#165c99` | O azul da fita. Botão primário deixa de ser quase-preto e passa a ser a marca |
| `--cor-forte` | `#1e293b` | `#0b3e6f` | Títulos e nomes no marinho do telhado |
| `--cor-fundo`, `--cor-superficie`, `--cor-suave`, `--cor-realce` | família slate (fria) | neutro quente | O creme `#fdfaf7` da marca. Um cinza azulado ao lado de um creme lê como erro de impressão |
| `--cor-borda`, `--cor-borda-suave` | slate-300 / slate-200 | neutro quente equivalente | Mesma família das superfícies |

**Como o neutro quente é escolhido, e não chutado:** parte-se do creme medido da marca (`#fdfaf7`) como a superfície mais clara, e derivam-se os degraus mantendo a mesma **relação de luminância** que a família slate tem hoje entre `fundo`, `superficie`, `suave` e `realce`. Assim o ritmo visual que já funciona é preservado, e só a temperatura muda. Cada degrau resultante passa pelo teste de contraste antes de entrar.

### 4.2 Token novo

| Token | Papel |
|---|---|
| `--cor-detalhe` | O dourado da §3. Só filete e anel |

### 4.3 Tokens que não mudam

Os treze semânticos — âmbar, vermelho e verde, com suas variantes de fundo e borda. Pelo motivo da §3.

### 4.4 O tema escuro não é derivável por regra

No claro, `--cor-acao` vira o azul da marca e funciona. **No escuro, o mesmo azul sobre `#0f172a` não atinge 4,5:1** — o botão primário some. O tema escuro já resolve isso hoje invertendo a ação (fundo claro, texto escuro), e a versão com marca precisa de um azul próprio, mais claro, escolhido pela medição e não pela intuição.

Vale para todos os tokens: **os valores do escuro são derivados medindo, um a um, contra os pares que o sistema realmente produz.** É o mesmo método que o design do tema escuro (`2026-08-24-tema-escuro-design.md`, §6.2) já estabeleceu, e o teste que ele criou continua sendo o juiz.

## 5. Tipografia e densidade

### 5.1 Parar de descartar a Geist

Uma linha: `body` deixa de fixar Arial e passa a usar `var(--font-sans)`, que já aponta para a Geist carregada. É o maior ganho visual isolado deste documento, e o mais barato.

A Geist é licenciada em SIL OFL 1.1. O wordmark da logo é um itálico de pincel e **não** é a fonte da interface — ele vive na imagem da marca.

### 5.2 Densidade por dispositivo

O conflito é real: aumentar o texto para quem lê no corredor tira linhas da tabela de quem confere lançamentos. Resolve-se por dispositivo, e não escolhendo um lado.

| | Celular | Desktop |
|---|---|---|
| Texto corrente | 16px | 14–15px |
| Alvo de toque | ≥ 44px | tamanho de ponteiro |
| Densidade de tabela | cartões empilhados | densa, como a §9 promete |

**Escala tipográfica** no lugar dos 152 `text-sm`: título de tela, título de seção, corpo, apoio, legenda. Cinco degraus, como já se fez com os cinco degraus de cor de texto — e pelo mesmo motivo: o que não tem nome vira decisão repetida em cada tela.

## 6. Ícones

**Lucide**, licença ISC, **copiados à mão** para `src/components/icones.tsx` — não instalados como dependência.

Cerca de quinze bastam: residente, prontuário, medicação, turno, financeiro, auditoria, funcionário, documento, alerta, sucesso, erro, busca, voltar, sair, tema.

Por que copiar em vez de instalar, num projeto que já é cuidadoso com cadeia de suprimento:

- Sem dependência nova, sem pergunta sobre o que ela arrasta junto
- Sem pergunta de bundle: o que está no arquivo é o que vai para o navegador
- Auditável: são caminhos SVG, legíveis, num arquivo
- A atribuição ISC cabe num comentário no topo do arquivo

**Ícone nunca vai sozinho.** Cada um acompanha rótulo em texto, ou leva `aria-label`. Ícone sem nome acessível é decoração que a equipe de plantão precisa adivinhar.

## 7. As três etapas

Cada uma entrega valor sozinha e é mesclável sozinha.

| Etapa | O que entra | Como se sabe que acabou |
|---|---|---|
| **1. Uso** | Geist de volta; escala tipográfica; densidade por dispositivo; alvos de 44px; tokens de cor novos | Contraste verde nos dois temas; E2E passa; nenhuma cor crua |
| **2. Vocabulário** | `Botao`, `Cartao`, `Etiqueta`; `icones.tsx`; aplicação nas telas | As telas passam a usar os primitivos em vez de classe solta |
| **3. Marca** | Logo, nome "Lar Dona Francisca", cabeçalho, favicon | O `<title>` e o cabeçalho dizem o nome certo |

A ordem é deliberada: a etapa 1 é quase toda token e não toca componente, então entra com risco baixo e melhora tudo de uma vez. A etapa 3 depende dos arquivos vetoriais da marca, que ainda não chegaram — e por isso é a última, não a primeira.

## 8. O material de referência não é versionado

As imagens vivem em `exemplo/`, no `.gitignore`. Dois motivos: são provisórias e de baixa resolução, e **algumas mostram residentes**. Foto de idoso em ILPI é dado pessoal, e o repositório não é lugar para ela.

Quando os arquivos definitivos da marca chegarem, o que entra no repositório é o SVG da logo — desenho, não fotografia.

## 9. Como se verifica

- **Contraste**: `tests/tema.test.ts` já lê o `globals.css` e mede os pares reais nos dois temas. Cada valor novo passa por ele antes de fechar. É o juiz, e não a intuição.
- **Cor crua**: a guarda do mesmo arquivo continua barrando `bg-white` e companhia. Os tokens novos entram por lá.
- **Alvo de toque**: teste E2E que mede a caixa dos controles principais no viewport de celular e exige 44px.
- **Densidade**: teste E2E que confere que a tabela de auditoria continua mostrando o mesmo número de linhas por tela no desktop — o compromisso da §9 vira asserção, em vez de intenção.
- **As 66 travessias de E2E** continuam passando. Redesenho que quebra fluxo não é redesenho.

## 10. O que este documento decide, e o que deixa em aberto

**Decide:** a paleta vem da marca e foi medida; o dourado é detalhe e nunca texto; a densidade é por dispositivo; os ícones são Lucide copiados à mão; a ordem das etapas.

**Deixa em aberto, de propósito:** os valores exatos do tema escuro, que serão derivados por medição na etapa 1; e os hexes finais, que serão reconferidos quando a marca chegar em vetor.

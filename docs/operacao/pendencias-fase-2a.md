# Pendências da Fase 2A

Registro do que ficou em aberto ao fechar o prontuário. Mesmo formato do de
Fase 1 (`pendencias-fase-1.md`): nenhum item impede o uso, e todos estão aqui
para não dependerem da memória de ninguém.

| # | Estado | Onde se resolve |
|---|---|---|
| 1. Cabeçalho clínico invisível ao ADMINISTRATIVO | resolvido | 25/08/2026 — §7.1 do design |
| 2. Sinal vital fora de faixa não alerta | resolvido | 28/08/2026 |
| 3. Sem gráfico de tendência | resolvido | 27/08/2026 |

## 1. O cabeçalho clínico é invisível ao ADMINISTRATIVO

**Situação:** a §7 do design põe todo o prontuário fora do alcance desse papel,
e alergia é prontuário. Quem atende a portaria e recebe uma entrega de alimento
não vê a restrição alimentar do residente; quem faz o cadastro não vê a alergia
grave a medicamento.

**Por que ficou assim:** é o que a spec-mãe manda, e a Fase 2A a seguiu em vez
de reinterpretá-la sozinha. A rota própria do prontuário torna a fronteira
nítida — mas nítida é diferente de certa.

**O que fazer:** conversar com a equipe do Lar antes de a 2A entrar em uso, com
uma pergunta concreta: *quem, na prática, precisa saber que a dona Maria não
pode comer camarão?* Se a resposta incluir alguém do administrativo, a correção
não é escondê-la melhor — é a §7 do design, que precisa passar a distinguir
"alergia e restrição alimentar" do resto do prontuário.

Enquanto isso não acontecer, **o cabeçalho está a um clique de quem pode vê-lo**
(o link "Prontuário" na ficha), e ninguém do administrativo o alcança nem pela
URL — há teste E2E para isso.

### Resolvido em 25/08/2026

A pergunta foi feita e a resposta foi sim: neste Lar, quem cadastra é a mesma pessoa que atende a portaria e recebe a entrega de alimento. A §7 do design mudou, como este registro previa que teria de mudar.

A §7.1 passou a distinguir **alertas de cuidado** — alergia, restrição alimentar e condição crônica — do resto do prontuário. Medicação ativa e aferição de sinais vitais continuam fora: não há ato administrativo que dependa delas.

**A fronteira de rota não se mexeu.** Os alertas aparecem na ficha; `obterCabecalhoClinico` continua sendo a guarda de `/residentes/[id]/prontuario` e continua exigindo COORDENACAO ou SAUDE. Quem lê os alertas é `obterAlertasDeCuidado`, função irmã com permissão própria — relaxar a primeira teria aberto a rota, porque a página não tem outra checagem de papel. O teste E2E que prova "não alcança nem pela URL" continua valendo, sem alteração.

**A tensão que sobrou, e está no design:** condição crônica é diagnóstico, não instrução. Ela entrou porque a conduta alimentar nem sempre é lançada como restrição explícita, mas a contrapartida é de processo — a equipe clínica registra a conduta como restrição, em vez de contar com a dedução de quem não é da saúde. Sem isso, a mudança troca uma lacuna por outra.

## 2. Sinal vital fora de faixa não alerta ninguém

**Situação:** o sistema aceita pressão 200×120 e temperatura de 40 °C sem dizer
nada. As faixas que existem em `sinais-vitais.service.ts` são de
**plausibilidade**, não clínicas: pegam dedo escorregado no teclado (365 °C), e
de propósito deixam passar a febre alta — recusá-la apagaria justamente o
registro que mais importa.

**Por que não foi feito:** alertar exigiria faixas de referência por residente
— idoso hipertenso tem outra linha de base — e uma decisão clínica sobre o que
é alerta e para quem ele vai. É trabalho de projeto, não de tela.

**Encaminhamento:** depois da 2B. Antes disso, o dado numérico separado já está
gravado, então nada precisa ser recadastrado quando o alerta existir.

### Resolvido em 28/08/2026

O encaminhamento se cumpriu como estava escrito: a 2B e a Fase 3 fecharam, o
item destravou, e **nada precisou ser recadastrado** — as aferições já
gravadas passaram a alertar sem qualquer migração de dado. Foi o que a decisão
de guardar o número separado, lá atrás, comprou.

**As duas perguntas que este item deixou em aberto foram respondidas pelo Lar**,
e as respostas não foram as que o registro supunha:

- *Faixas de referência por residente?* Sim — e faixas de **normalidade**, não
  de urgência, com o custo à vista: quem não for ajustado e viver fora delas
  gera alerta diário. A tela de ajuste existe para isso.
- *Para quem o alerta vai?* Para coordenação e saúde. **A fronteira da §7 não se
  mexeu.** Ao contrário do item 1 deste mesmo documento, aqui a pergunta *quem
  age sobre isso?* não incluiu a portaria nem o cadastro — não há ato
  administrativo que dependa de conhecer a pressão de um residente.

O alerta ficou em `/pendencias`, e não em tela própria: aferição fora de faixa é
o mesmo problema do exame esquecido, com outro nome, e uma tela nova seria a
segunda que ninguém abre.

Ver `pendencias-alerta-sinal-vital.md` para o que ficou aberto, e
`docs/superpowers/specs/2026-08-27-alerta-sinal-vital-design.md` para o desenho.

## 3. Não há gráfico de tendência de pressão e peso — resolvido

**Como estava:** deliberado, e registrado porque a spec-mãe menciona a tendência
ao justificar os campos numéricos separados. Os campos existiam para **tornar o
gráfico possível** depois, não para prometê-lo.

**Resolvido em 27/08/2026.** Alguém pediu, e o dado estava lá: nenhuma migração,
nenhum recadastro — a aposta de guardar cada medida em campo próprio pagou pela
segunda vez, depois do alerta de sinal vital.

A tela é `/residentes/[id]/prontuario/tendencia`, com as oito medidas — as sete
que alertam mais o peso — e três janelas: 30, 90 e 365 dias. A medida e a janela
vivem na URL, então o seletor é um link por opção, sem componente cliente e sem
estado. O SVG é desenhado no servidor, sem biblioteca de gráfico.

**O que a execução ensinou, e vale registrar:**

**O tipo é que guarda a decisão sobre o peso.** `MedidaVital` tem sete valores
de propósito. O gráfico precisa de oito, e ganhou tipo próprio —
`MedidaGrafico = MedidaVital | 'PESO'`. Há teste afirmando os dois lados: o
gráfico com oito, o alerta com sete. Sem ele, acrescentar `PESO` à lista do
alerta para "aproveitar" faria peso voltar a alertar por faixa fixa, que é
justamente o que ficou decidido não fazer.

**`Math.min()` de lista vazia devolve `Infinity`**, e `Infinity` vira `NaN` na
conta da posição, e `NaN` sai no atributo do SVG — que não desenha e não
reclama. Peso de quem não foi pesado na janela é exatamente esse caso. O mesmo
vale para escala sem amplitude: uma pesagem só divide por zero.

**Um teste passou pelo motivo errado, e só a quebra proposital mostrou.** O
teste dos dois vazios — "nunca se aferiu isto" contra "nada nesta janela" —
passava com as duas mensagens iguais: a medida que ele escolheu tinha aferição
recente, e a tela nem chegava a ficar vazia. Foi preciso unificar as mensagens
de propósito, ver o teste continuar verde e refazer o cenário.

## 3.1 O que ficou de fora do gráfico, deliberadamente

**Não se lê valor exato no desenho.** Não há dica ao passar o mouse nem rótulo
por ponto: seriam JavaScript no cliente ou poluição visual, e a lista de
aferições do prontuário já traz cada número escrito. O gráfico responde "para
onde isto está indo", e não "quanto deu no dia 12".

**A escala inclui a faixa, e isso achata a variação.** Uma pressão que oscila
entre 128 e 152 é desenhada num eixo de 90 a 152, porque a faixa precisa caber.
A alternativa — ajustar o eixo aos pontos — mostraria a oscilação em detalhe e
esconderia o quanto falta para sair do normal. Escolheu-se a segunda pergunta
como a mais importante.

**Trezentos e sessenta e cinco pontos num quadro de 576 unidades se
amontoam.** Com aferição diária, a janela de um ano vira um borrão. Ela existe
para enxergar tendência longa de medida esparsa — peso, tipicamente mensal — e
não para ler o ano inteiro de uma pressão diária.

**O alerta dispensado não aparece no gráfico.** Um ponto vermelho é um ponto
fora da faixa, tenha alguém dispensado o alerta dele ou não. Marcá-los exigiria
decidir o que "dispensado" significa numa série temporal, e a trilha de
auditoria já guarda quem dispensou o quê.

## O que a Fase 2A resolveu e vale registrar

Duas coisas que não estavam previstas no plano e apareceram na execução:

**`AnotacaoSaude` nasceu com `autorId` e `criadoPorId`.** Dois campos com o
mesmo significado, e aqui o campo é o que decide quem pode corrigir o registro
dentro da janela de 15 minutos. `autorId` foi removido na mesma branch, antes
de qualquer dado existir.

**A regra R3 foi extraída para `src/lib/janela-edicao.ts`** antes de a segunda
entidade usá-la. Duas cópias da mesma regra divergem, e esta é regra que a
fiscalização lê.

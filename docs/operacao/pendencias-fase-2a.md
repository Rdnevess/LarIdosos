# Pendências da Fase 2A

Registro do que ficou em aberto ao fechar o prontuário. Mesmo formato do de
Fase 1 (`pendencias-fase-1.md`): nenhum item impede o uso, e todos estão aqui
para não dependerem da memória de ninguém.

| # | Estado | Onde se resolve |
|---|---|---|
| 1. Cabeçalho clínico invisível ao ADMINISTRATIVO | resolvido | 25/08/2026 — §7.1 do design |
| 2. Sinal vital fora de faixa não alerta | resolvido | 28/08/2026 |
| 3. Sem gráfico de tendência | aberto, deliberado | quando alguém pedir |

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

## 3. Não há gráfico de tendência de pressão e peso

Deliberado, e registrado porque a spec-mãe menciona a tendência ao justificar os
campos numéricos separados. Os campos existem para **tornar o gráfico possível**
depois, não para prometê-lo agora. A linha do tempo já mostra a sequência das
aferições em ordem; o gráfico entra quando alguém pedir, e o dado estará lá.

## O que a Fase 2A resolveu e vale registrar

Duas coisas que não estavam previstas no plano e apareceram na execução:

**`AnotacaoSaude` nasceu com `autorId` e `criadoPorId`.** Dois campos com o
mesmo significado, e aqui o campo é o que decide quem pode corrigir o registro
dentro da janela de 15 minutos. `autorId` foi removido na mesma branch, antes
de qualquer dado existir.

**A regra R3 foi extraída para `src/lib/janela-edicao.ts`** antes de a segunda
entidade usá-la. Duas cópias da mesma regra divergem, e esta é regra que a
fiscalização lê.

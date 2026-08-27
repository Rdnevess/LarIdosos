# Pendências do alerta de sinal vital

Registro do que ficou em aberto ao fechar o alerta de sinal vital fora de faixa,
que resolveu o item 2 das pendências da Fase 2A — aberto desde 25/08/2026.
Mesmo formato dos anteriores: nenhum item impede o uso, e todos estão aqui para
não dependerem da memória de ninguém.

O **item 1 é o único que precisa de gente**, e não de código. Os demais são
consequências aceitas ao decidir.

| # | Estado | Onde se resolve |
|---|---|---|
| 1. Os números das faixas do sistema são provisórios | em uso, revisão pendente | com a equipe de saúde do Lar |
| 2. A janela de sete dias | aberto, deliberado | se a equipe aferir com menos frequência |
| 3. Não há tela que meça se o alerta virou ruído | aberto, deliberado | quando a suspeita aparecer |
| 4. Peso continua fora | aberto, deliberado | é o item 3 da Fase 2A |
| 5. Não há alerta sobre a *ausência* de aferição | fora de escopo | merece a sua própria decisão |

## 1. Os números das faixas do sistema são provisórios, e não decisão clínica

**Situação:** `FAIXAS_DO_SISTEMA`, em `src/modules/health/faixas.ts`, traz sete
faixas — pressão sistólica 90–140, diastólica 60–90, frequência cardíaca 50–100,
respiratória 12–20, temperatura 35,5–37,8, saturação a partir de 92, glicemia
70–180.

**De onde vieram:** de mim, ao escrever a spec, para que a conversa com a equipe
tivesse um documento concreto na mesa em vez de uma tabela em branco. **Não são
clínicos.**

**Por que isto está escrito aqui, e não só no código:** dois dias antes, a regra
do registro tardio recebeu um limite de quatro horas escolhido pelo mesmo
método — preservar a sensibilidade da regra anterior — e o Lar o substituiu por
um critério que descrevia um fato do plantão. Inventar número e chamá-lo de
clínico é um erro que este projeto já cometeu uma vez.

### Em uso desde 27/08/2026, a título provisório

O dono do projeto autorizou que entrassem como estão, com a revisão clínica
pendente: *"pode ser com a sua proposta, se necessário altero depois"*.

**O que isso muda, e o que não muda.** Muda o estado: o alerta funciona hoje, e
não espera reunião para começar a servir. Não muda a natureza dos números —
autorizar o uso não os torna clínicos, e este item continua aberto por isso. A
diferença entre "em uso" e "validado" é a razão de este parágrafo existir em vez
de o item ser fechado.

**Como resolver de verdade:** levar a tabela à equipe de saúde e trocar os
valores. O sistema funciona com qualquer conjunto que entre ali, e **nada mais
no desenho depende dos números** — não há migração, nem dado a recadastrar.

**O sinal de que a revisão ficou tarde demais:** se a equipe passar a dispensar
alertas em série sem ajustar faixa de residente nenhum, pode ser que a faixa do
sistema esteja errada para esta população — e não que cada residente precise de
ajuste. É o número do item 3 que responde, e ele existe na trilha.

**O que não fazer:** afinar os números por palpite ao ver o relatório cheio ou
vazio. Se muita gente estiver alertando, o caminho é ajustar a faixa de quem tem
condição crônica registrada, não afrouxar a de todo mundo.

## 2. A janela de sete dias

**Situação:** só aferições dos últimos sete dias viram alerta
(`DIAS_DA_JANELA`, em `alertas-vitais.ts`).

**Por que está assim:** uma pressão alta de três meses atrás não é pendência, é
história — e história é a linha do tempo do prontuário, que já existe. Sem
janela, a tela cresceria para sempre e o alerta perderia o sentido de "o que
precisa de atenção".

**O risco que sobra:** se a equipe aferir com menos frequência do que uma vez
por semana, um alerta pode sumir antes de alguém abrir a tela. Sete dias foi
escolhido sem conhecer a rotina de aferição do Lar.

**Como saber se deu errado:** perguntar de quanto em quanto tempo se afere. Se
a resposta for "quinzenal" para alguma medida, a janela precisa crescer.

## 3. Não há tela que meça se o alerta virou ruído

**Situação:** o Lar escolheu faixas de normalidade sabendo que quem não for
ajustado gera alerta diário. O número que mede se isso aconteceu é o percentual
de alertas dispensados sem que a faixa do residente seja ajustada depois.

**Onde ele está:** na trilha de auditoria. Dispensar deixa linha
(`AlertaDispensado`) e ajustar faixa também (`FaixaReferencia`), então o número
é consultável — mas por consulta, e não por tela.

**Por que não se construiu a tela:** prometer painel para um risco que ainda não
se manifestou é construir contra suposição. O dado existe para ser olhado no dia
em que a suspeita aparecer, e é isso que este registro garante.

**O que fazer quando a suspeita aparecer:** olhar o número antes de mexer nas
faixas do sistema. Se a equipe dispensa em série e ninguém ajusta faixa nenhuma,
o problema é de processo — falta ajustar as faixas de quem tem condição crônica
registrada —, e não das faixas do sistema.

## 4. Peso continua fora

**Situação:** as sete medidas que alertam não incluem peso, e há teste afirmando
isso em `faixas.test.ts`.

**Por que:** 62 kg não é alarmante nem tranquilizador sem os 68 kg do mês
passado. Peso é **tendência**, e um alerta por faixa fixa diria algo que não
quer dizer nada.

**Onde se resolve:** é o item 3 das pendências da Fase 2A — o gráfico de
tendência —, que continua aberto e deliberado. Se a coordenação quiser alerta de
perda de peso, o trabalho é aquele, e não este.

## 5. Não há alerta sobre a ausência de aferição

**Situação:** o sistema alerta quando alguém mediu e o número saiu fora. Não
alerta quando **ninguém mediu**.

**Por que ficou fora:** é outro problema — ausência de dado, e não dado fora de
faixa — e provavelmente mais grave. "Ninguém mediu a pressão da dona Maria esta
semana" exige decidir de quanto em quanto tempo cada medida deve ser aferida,
por residente, o que é uma segunda rodada de decisão clínica.

**Relação com o item 2:** os dois dependem da mesma resposta — a frequência de
aferição do Lar. Vale perguntar as duas coisas na mesma conversa.

## O que a execução resolveu e vale registrar

Três coisas que apareceram ao implementar, e não no desenho.

**A trilha de auditoria tem uma guarda de exaustividade, e ela funcionou.** Ao
acrescentar `FaixaReferencia` e `AlertaDispensado` às entidades auditadas, o
`tsc` reprovou a tela de auditoria: o mapa de rótulos é
`Record<EntidadeAuditada, string>`, e entidade sem rótulo não compila. Alguém
pôs isso ali de propósito, e o comentário no arquivo diz que era o que a versão
anterior lamentava não conseguir.

**A guarda de tamanho de página barrou um atalho de teste.** A primeira versão
do teste de travessia da paginação pedia `por: 2` para forçar a fatia a
atravessar as três listas, e o `tsc` recusou — `Tamanho` é a união fechada
`20 | 40 | 60`. Furar o tipo com um *cast* teria sido o caminho fácil e errado;
o cenário do teste cresceu até a travessia acontecer num tamanho de página de
verdade.

**A condição de sucesso do formulário de faixas era uma armadilha prevista.** O
plano avisava que "sem erro" não é o mesmo que "salvou" — o estado inicial do
`useActionState` também não tem erro, e a mensagem apareceria antes de alguém
salvar. O estado ganhou um campo `salvo` explícito, e o E2E confirma que a
mensagem só aparece depois do clique.

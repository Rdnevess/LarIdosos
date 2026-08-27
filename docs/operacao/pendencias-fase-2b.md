# Pendências da Fase 2B

Registro do que ficou em aberto ao fechar o controle de medicação. Mesmo
formato dos de Fase 1 e 2A: nenhum item impede o uso, e todos estão aqui para
não dependerem da memória de ninguém.

| # | Estado | Onde se resolve |
|---|---|---|
| 1. Justificativa obrigatória no registro tardio | aberto, muito reduzido | 27/08/2026 mudou o gatilho; o número ainda vale olhar |
| 2. A lacuna entre suspender e prescrever | aberto — mitigado | na área de pendências, se acontecer |
| 3. Custo da derivação em períodos longos | aberto, sem urgência | quando doer, medindo antes |
| 4. Sem alerta de dose atrasada fora da tela | aberto, deliberado | não se resolve sem app nativo |

## 1. A justificativa obrigatória pode empurrar a equipe a não registrar

**Situação:** registrar uma dose de turno passado exige escrever o que
aconteceu. Foi decisão do dono do projeto, tomada com a alternativa na mesa.

**A tensão, que já estava na spec:** a justificativa põe atrito exatamente em
quem já está atrasado, e atrito é o que faz ninguém registrar. A alternativa —
livre e silencioso — deixaria "limpar" o relatório de aderência no fim do mês
sem deixar rastro visível na tela.

**Como saber se deu errado:** se a equipe passar a evitar o registro tardio por
causa do campo, o percentual de **doses sem registro** sobe. Esse número está
no relatório de aderência de cada residente, e é justamente o indicador que a
coordenação acompanha. A decisão volta à mesa com dado, não com suposição.

**O que não fazer:** afrouxar a regra sem olhar o número. Ele existe para isso.

### O atrito caiu muito em 27/08/2026, e não por afrouxamento

A regra do que conta como tardio mudou duas vezes naquele dia, e a segunda
mudança veio do próprio Lar: **atraso para o turno seguinte deixou de contar**.
Quem entra à noite e registra uma dose do dia não escreve justificativa nenhuma
— está fazendo o trabalho normal do plantão.

A exigência agora só alcança a dose que atravessou uma rotação inteira: o
remédio do turno do dia que ninguém registrou e que só foi lançado quando a
equipe do dia voltou. Ver `pendencias-listas-e-turnos.md`, item 3.

**Isto não é o afrouxamento que o parágrafo acima proíbe.** Aquele seria tirar a
justificativa de onde ela faz falta, olhando o relatório e achando que está
cheio. Este foi mover o gatilho para onde o Lar reconhece o problema — o atrito
saiu de cima de quem está resolvendo a pendência e ficou sobre quem a deixou
passar um plantão inteiro.

**O que continua valendo deste item:** o percentual de doses sem registro segue
sendo o número a acompanhar. Se ele subir mesmo com o atrito reduzido, a causa
não era o campo de justificativa — e a decisão volta à mesa com a suspeita
certa, que é o que este registro sempre existiu para permitir.

**A mensagem foi corrigida junto.** Ela dizia "Esta dose é de um turno que já
passou", que descrevia o gatilho antigo e ensinaria à equipe uma regra que o
sistema não tem mais. Agora diz que a dose ficou sem registro até o turno dela
voltar, e há teste prendendo o texto — é o que a pessoa de plantão lê.

## 2. Nada obriga a completar o segundo passo da substituição

**Situação:** trocar uma prescrição são dois atos — suspender, e prescrever a
substituta. Entre eles, o residente fica sem prescrição ativa daquele fármaco.

**O que reduz o risco:** depois de suspender, a tela oferece **"Prescrever
substituta"** em destaque, com todos os campos da anterior pré-preenchidos. E
`prescreverSubstituta` recusa enquanto a anterior estiver ativa, o que impede o
atalho de "editar no lugar" por outro nome.

**O que ainda não existe:** nada impede alguém de suspender e fechar a tela. Se
na prática isso acontecer, o conserto é um alerta de "residente com prescrição
suspensa nas últimas 24h e sem substituta" — e o lugar dele é a área
`/pendencias`, que já existe e já atravessa todos os residentes.

## 3. A derivação recalcula tudo, todas as vezes

**Situação:** `dosesPrevistas` é chamada a cada abertura da tela do turno e a
cada relatório de aderência. Ela varre as prescrições vigentes e monta as doses
em memória.

**Por que não é problema hoje:** trinta residentes, poucas prescrições por
pessoa, janela de **doze** horas na tela do turno e trinta dias no relatório. O
custo é irrelevante, e a alternativa — materializar as doses — foi descartada
pela spec-mãe por razões que continuam valendo: exigiria cron, duplicaria
estado, e converter pendência em "não administrada" no fim do dia gravaria
afirmação falsa no prontuário.

**A janela dobrou em 27/08/2026**, quando os três turnos de oito horas viraram
dois de doze. O custo desta derivação dobrou junto, e continua irrelevante na
escala do Lar — mas o número está corrigido aqui porque este documento existe
para ser lido depois, e uma justificativa com o número errado é uma justificativa
que não se pode conferir.

**Onde vai doer primeiro, se doer:** o relatório de aderência de um período
longo (um ano) sobre medicação de uso contínuo. **Meça antes de mudar.** O
módulo é puro e sem banco justamente para que medir seja fácil.

## 4. Não há alerta de dose atrasada fora da tela aberta

Deliberado, e a §5.2 do design geral já explicava: sem app nativo e sem service
worker, notificação em navegador móvel não é confiável o bastante para uma
função clínica. Uma notificação que às vezes não chega é pior que nenhuma,
porque a equipe passa a confiar nela.

O mecanismo que funciona é o destaque na tela aberta: dose vencida há mais de
30 minutos ganha borda âmbar, e "sem registro" tem o mesmo peso visual — as
duas pedem ação humana.

## O que a Fase 2B corrigiu e vale registrar

**A prescrição nascia valendo só a partir do momento em que era digitada.** Uma
receita do café da manhã cadastrada às 10h perdia a dose das 08:00 daquele dia.
O formulário ganhou "Vigente a partir de", em branco valendo agora. Foi o E2E
que achou.

**`turnoDaHora` existia em duas cópias** — uma em `prontuario/acoes.ts`, da 2A,
e a que a 2B precisava. A divisão do dia virou `src/lib/turno.ts`, e a cópia
foi apagada. Duas divisões seriam duas respostas para "em que turno isso
aconteceu?".

**Um teste de aderência nascia dependente do relógio:** uma dose das 08:00 de
hoje, registrada dentro do mesmo turno, não é tardia — e a asserção passava ou
falhava conforme a hora em que a suíte rodasse. Passou a usar um dia claramente
no passado.

*(A regra do registro tardio mudou em 27/08/2026: deixou de ser "fora do turno
da dose" e passou a ser "quatro horas ou mais depois do previsto". O motivo do
teste continua valendo — o que mudou foi o que ele mede.)*

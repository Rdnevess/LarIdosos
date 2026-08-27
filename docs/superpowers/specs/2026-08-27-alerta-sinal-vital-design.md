# Alerta de sinal vital fora de faixa — design

Resolve o item 2 das pendências da Fase 2A, aberto desde 25/08/2026 com o
encaminhamento "depois da 2B". A 2B e a Fase 3 fecharam, e ele está desbloqueado.

**O problema:** o sistema aceita pressão 200×120 e temperatura de 40 °C sem
dizer nada a ninguém. As faixas que existem em `sinais-vitais.service.ts` são de
**plausibilidade** — pegam dedo escorregado no teclado, como 365 °C — e de
propósito deixam passar a febre alta, porque recusá-la apagaria justamente o
registro que mais importa. Nada, hoje, transforma um número preocupante em algo
que alguém veja sem abrir a ficha.

## 1. O que este documento decide

| Decisão | Quem decidiu |
|---|---|
| O alerta alcança COORDENACAO e SAUDE; a §7 não se mexe | o Lar, 27/08/2026 |
| Faixas de **normalidade**, com ajuste por residente | o Lar, 27/08/2026 |
| Dispensar apaga **uma aferição para um usuário** | o Lar, 27/08/2026 |
| O alerta vive em `/pendencias` | este documento |
| É derivado, não materializado | este documento |
| Peso fica fora | este documento |
| COORDENACAO e SAUDE ajustam a faixa | este documento |

## 2. Quem vê, e por que a fronteira não se mexe

Sinal vital é prontuário, e a §7 da spec-mãe põe o prontuário fora do alcance do
papel ADMINISTRATIVO. **Essa fronteira fica onde está.**

Houve uma exceção antes — os alertas de cuidado (alergia, restrição alimentar,
condição crônica) passaram a ser visíveis ao administrativo em 25/08/2026 —, e
ela teve um motivo concreto: quem atende a portaria e recebe entrega de alimento
precisa saber da restrição. O mesmo teste foi aplicado aqui, com a mesma
pergunta: *uma pressão de 200×120 aferida agora, quem no Lar age sobre isso?* A
resposta não incluiu a portaria nem o cadastro.

**"Todos", aqui, quer dizer todos os que cuidam.** Não há ato administrativo que
dependa de conhecer a pressão de um residente, e dado de saúde alcançando quem
não age sobre ele é exposição sem contrapartida — o que a LGPD (art. 11) torna
relevante e o que o resto deste sistema já evita.

## 3. Faixas de normalidade, com ajuste por residente

O Lar escolheu faixas de normalidade — e não de urgência — com ajuste por
residente. **A escolha foi feita com o custo à vista**, e ele é este: quem não
tiver a faixa ajustada e viver fora da faixa do sistema gera alerta todo dia.
Idoso hipertenso em ILPI é a regra, não a exceção.

### 3.1 As faixas do sistema

São o ponto de partida de quem não tem ajuste. **Os números abaixo são proposta,
e precisam da equipe de saúde do Lar antes de entrarem** — estão aqui para que a
conversa tenha um documento concreto na mesa, e não uma lista em branco.

| Medida | Mínimo | Máximo |
|---|---|---|
| Pressão sistólica | 90 | 140 |
| Pressão diastólica | 60 | 90 |
| Frequência cardíaca | 50 | 100 |
| Frequência respiratória | 12 | 20 |
| Temperatura | 35,5 °C | 37,8 °C |
| Saturação de O₂ | 92 % | — |
| Glicemia | 70 | 180 |

O máximo da saturação fica vazio de propósito: não existe saturação alta demais.

### 3.2 O ajuste por residente

`FaixaReferencia(residenteId, medida, minimo, maximo)` — uma linha para cada
medida ajustada, e nada para as demais. Quem não tem linha usa a faixa do
sistema.

**Tabela, e não dezesseis colunas em `Residente`.** As colunas fariam o mesmo
pior: o modelo do residente é cadastral e ganharia metade da sua largura em
parâmetros clínicos, e acrescentar uma medida nova seria uma migration de duas
colunas em vez de nenhuma. Um campo JSON tiraria a checagem do banco.

**Quem ajusta:** COORDENACAO e SAUDE, os mesmos papéis que aferem e prescrevem.
Restringir à coordenação faria a enfermeira que observa a linha de base do
residente depender de outra pessoa para registrá-la — e é ela quem a observa.

**Toda escrita de faixa entra na trilha de auditoria**, como qualquer outra
neste sistema. Mudar a faixa de um residente muda o que o sistema considera
normal para ele, e isso é decisão clínica com autor e data.

### 3.3 Peso fica de fora

As sete medidas acima significam alguma coisa como número isolado. Peso não:
62 kg não é alarmante nem tranquilizador sem os 68 kg do mês passado. Peso é
**tendência**, e tendência é o item 3 das pendências da Fase 2A — aberto,
deliberado, esperando alguém pedir. Um alerta de peso por faixa fixa diria algo
que não quer dizer nada.

## 4. O alerta é derivado, não materializado

Sai da comparação, na leitura, entre as aferições e a faixa vigente do
residente. Não há tabela de alertas, nem processo que os crie.

É a mesma decisão que a spec-mãe tomou para as doses previstas, e pelo mesmo
motivo: materializar exigiria cron, duplicaria estado e gravaria no prontuário
uma afirmação que ninguém fez. Aqui há um motivo a mais — **a faixa pode mudar**.
Um alerta materializado sob a faixa antiga continuaria existindo depois do
ajuste, e alguém teria de sair apagando alertas que a nova faixa não produz.

**Consequência aceita:** a leitura custa uma consulta às aferições recentes de
todos os residentes. Trinta residentes e uma janela curta tornam o custo
irrelevante, pelo mesmo argumento do item 3 das pendências da 2B — e, como lá, o
que se faz quando doer é medir antes.

### 4.1 A janela

Só as aferições dos últimos **sete dias** entram. Uma pressão alta de três meses
atrás não é pendência, é história — e história é a linha do tempo do prontuário,
que já existe. Sem janela, a tela cresceria para sempre e o alerta perderia o
sentido de "o que precisa de atenção".

## 5. Dispensar

`AlertaDispensado(usuarioId, sinalVitalId, medida)`. **Existir é estar
dispensado**; não há campo booleano a manter nem estado a sincronizar.

- Some **só para quem clicou**. Outro usuário continua vendo.
- Some **só aquela medida daquela aferição**. A aferição seguinte do mesmo
  residente, fora de faixa, é alerta novo e aparece para todos.
- **Sem motivo escrito.** Foi decisão do Lar, e a alternativa está registrada:
  exigir uma linha ("médico avisado") viraria registro consultável ao custo de
  atrito em quem está de plantão. Se o dispensar virar reflexo, é o número da
  §7 que denuncia — e aí a decisão volta à mesa com dado.
- **Entra na trilha de auditoria.** Dispensar um alerta clínico é ato, e neste
  sistema todo ato deixa rastro. É também o que torna o número da §7 possível.

Dispensar **não apaga nada e não altera o prontuário**. A aferição continua onde
está, com o valor que tem; o que muda é uma linha da tela de quem clicou.

## 6. Onde aparece

Em **`/pendencias`**, como uma terceira seção ao lado de exames e consultas.

A tela existe para exatamente isto: o que está em aberto atravessando todos os
residentes. O README a descreve assim — *"exame solicitado e esquecido é o
problema real numa ILPI, e ninguém o percebe abrindo trinta fichas uma a uma"*.
Aferição fora de faixa é o mesmo problema com outro nome. Uma tela nova seria a
segunda tela que ninguém abre.

**Cada linha diz desde quando.** "Pressão sistólica 200 (faixa 90–140) · fora há
4 aferições seguidas" carrega a informação que decide se é evento ou padrão — e
é a que separa o alerta que pede ação da linha de base que pede ajuste de faixa.

**O papel ADMINISTRATIVO não alcança `/pendencias`** hoje, e continua não
alcançando: o serviço já exige COORDENACAO ou SAUDE. Nada de novo precisa ser
barrado.

**Interação com a paginação:** `/pendencias` tem um limite para a tela toda, e
as listas são fatiadas como uma sequência só. Os alertas entram nessa sequência
**antes** de exames e consultas, e não depois — se a página encher, o que não
pode sumir da primeira tela é o sinal vital, e não o exame agendado. Está
registrado no item 1 das pendências das listas que a ordem tem essa
consequência.

## 7. Como se verifica que o alerta não virou ruído

O risco que o Lar aceitou tem um número que o mede: **o percentual de alertas
dispensados sem que a faixa do residente seja ajustada depois**.

Se a equipe passar a dispensar em série e ninguém ajustar faixa nenhuma, o
alerta virou ruído e a resposta não é afrouxar a faixa do sistema por palpite —
é ajustar as faixas de quem tem condição crônica registrada. A tela de faixas
ajuda: ela lista **quem ainda usa a faixa do sistema tendo condição crônica
registrada**, que é o candidato óbvio.

É o mesmo mecanismo do percentual de doses sem registro, que a coordenação já
acompanha, e do aviso de conselho vencendo, que só aparece quando há algo a
mostrar. Este sistema já sabe que alerta que dispara demais treina a equipe a
ignorá-lo.

**De onde o número sai, e o que não se promete aqui:** dispensar e ajustar faixa
entram na trilha, então o número é consultável ali — não há tela que o mostre, e
não se constrói uma agora. Prometer um painel para um risco que ainda não se
manifestou seria construir contra uma suposição. O que este documento garante é
que o dado existe para ser olhado no dia em que a suspeita aparecer.

## 8. Modelo de dados

```prisma
enum MedidaVital {
  PRESSAO_SISTOLICA
  PRESSAO_DIASTOLICA
  FREQUENCIA_CARDIACA
  FREQUENCIA_RESPIRATORIA
  TEMPERATURA
  SATURACAO_O2
  GLICEMIA
}

model FaixaReferencia {
  id           String      @id @default(cuid())
  residenteId  String
  residente    Residente   @relation(fields: [residenteId], references: [id])
  medida       MedidaVital
  minimo       Decimal?    @db.Decimal(5, 1)
  maximo       Decimal?    @db.Decimal(5, 1)
  criadoEm     DateTime    @default(now())
  atualizadoEm DateTime    @updatedAt
  criadoPorId  String?

  @@unique([residenteId, medida])
  @@map("faixas_referencia")
}

// `SinalVital` ganha o outro lado da relação:
//   alertasDispensados AlertaDispensado[]
// Sem ele o Prisma recusa o schema — e é a ponta que se esquece.

model AlertaDispensado {
  id           String      @id @default(cuid())
  usuarioId    String
  sinalVitalId String
  sinalVital   SinalVital  @relation(fields: [sinalVitalId], references: [id])
  medida       MedidaVital
  criadoEm     DateTime    @default(now())

  @@unique([usuarioId, sinalVitalId, medida])
  @@index([usuarioId])
  @@map("alertas_dispensados")
}
```

`minimo` e `maximo` são anuláveis porque nem toda medida tem os dois lados — a
saturação não tem máximo. `Decimal(5,1)` porque a temperatura tem casa decimal e
as demais não; usar `Float` traria o erro de ponto flutuante para uma comparação
que decide se alguém é alertado.

O `@@unique([residenteId, medida])` é o que impede duas faixas concorrentes para
a mesma medida do mesmo residente — sem ele, "qual é a faixa da dona Maria" teria
duas respostas.

## 9. Testes

- **A comparação**, por unidade: valor dentro, fora por cima, fora por baixo, e
  as bordas exatas (o mínimo e o máximo são inclusivos e **não** alertam).
- **A precedência**: residente com faixa ajustada usa a dele; sem ajuste, usa a
  do sistema. É a regra que decide quem é alertado, e a que mais custa se errar.
- **Medida sem um dos lados**: saturação de 99 % não alerta por não ter máximo.
- **A janela de sete dias**: aferição de oito dias atrás não aparece.
- **O dispensar**: some para quem clicou e continua para o outro usuário; a
  aferição seguinte do mesmo residente volta a aparecer para os dois.
- **A fronteira de papel**: ADMINISTRATIVO recebe `ErroPermissao` ao tentar
  alcançar os alertas, e a tentativa entra na trilha como `ACESSO_NEGADO`.
- **A auditoria**: ajustar faixa e dispensar alerta deixam linha.
- **E2E**: uma aferição fora de faixa aparece em `/pendencias`, é dispensada, e
  o segundo perfil autenticado continua vendo-a.

## 10. Fora de escopo

- **Notificação fora da tela** (push, SMS, e-mail). É o item 4 das pendências da
  2B, deliberado e sem solução sem aplicativo nativo.
- **Gráfico de tendência**, e portanto **peso**. Item 3 das pendências da 2A.
- **Faixas por faixa etária ou sexo.** Trinta residentes idosos são uma
  população homogênea o bastante para que o ajuste individual resolva melhor.
- **Alerta sobre a ausência de aferição.** "Ninguém mediu a pressão da dona
  Maria esta semana" é outro problema, e provavelmente mais grave — mas é
  ausência de dado, não dado fora de faixa, e merece a sua própria decisão.

## 11. O que este documento deixa em aberto, de propósito

**Os números da §3.1.** São proposta, e precisam da equipe de saúde do Lar. O
sistema funciona com qualquer conjunto que entre ali; o que não se pode é
inventá-los e chamar de clínicos — foi exatamente o erro que a regra das "quatro
horas" do registro tardio cometeu, dois dias atrás, e que o próprio Lar
corrigiu.

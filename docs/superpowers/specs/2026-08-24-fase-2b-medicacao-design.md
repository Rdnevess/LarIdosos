# Fase 2B — Medicação

Detalha, para implementação, o que `2026-08-18-lar-idosos-design.md` fixa nas
§3, §4.5, §5, §6 (R4 e R5) e §7. Onde este documento diverge daquele, a
divergência está marcada e justificada.

**O que a 2B é:** o módulo mais crítico do sistema. A spec-mãe o separou da 2A
de propósito, para a equipe já estar habituada à ferramenta antes de confiar a
ela o controle de medicação. Essa condição está satisfeita: a 2A entrou.

## 1. As duas decisões estruturais

Tomadas em 24/08/2026, com o dono do projeto.

### 1.1 Registro tardio é livre, e exige justificativa

A tela do turno navega para qualquer turno passado, e uma dose esquecida
ontem pode ser registrada hoje. **Fora do turno da dose, a observação é
obrigatória** — recusada vazia pelo serviço, não apenas pedida pela tela.

O "um toque" que a §5.2 promete continua valendo onde ele importa: no turno
corrente, marcar administrada é um clique, sem campo nenhum.

**`SE_NECESSARIO` nunca é tardia.** Não tem `horarioPrevisto`, logo não há
turno de referência a comparar: ela é registrada quando acontece, e a
observação continua opcional.

**A tensão, assumida:** exigir justificativa põe atrito exatamente em quem já
está atrasado, e atrito é o que faz ninguém registrar. A alternativa — livre e
silencioso — deixaria maquiar o relatório de aderência no fim do mês sem
deixar rastro visível na tela. Ficou a justificativa, e o custo é reconhecido:
se a equipe passar a evitar o registro tardio por causa dela, o indicador de
"sem registro" sobe e a decisão volta à mesa com dado em vez de suposição.

### 1.2 Trocar prescrição são dois passos: suspender e prescrever

A R5 manda encerrar a prescrição vigente e criar outra, com
`substituiMedicacaoId` apontando para a anterior. A tela expõe isso como dois
atos explícitos — **"Suspender"**, com motivo, e **"Prescrever substituta"** —
e não como um "Editar" que substitui por baixo.

**A lacuna que isso abre, e como ela é fechada:** entre os dois passos a
medicação fica sem cobertura, e alguém que pare no meio deixa o residente sem
prescrição ativa. Depois de suspender, a tela oferece **"Prescrever
substituta"** em destaque, com todos os campos pré-preenchidos com os valores
da anterior; é esse caminho que grava `substituiMedicacaoId`. Uma prescrição
nova criada pelo formulário comum não recebe o elo, porque não é substituição
de nada.

## 2. Duas correções ao modelo da spec-mãe

### 2.1 `horarioPrevisto` é `DateTime`, não `HH:mm`

É a **instância** da dose — 24/08/2026 às 08:00 —, não o horário do esquema.

Sem isso, a restrição única `(medicacaoId, horarioPrevisto)` que a R4 exige
permitiria uma administração por medicação **para sempre**, em vez de uma por
dose: a segunda vez que alguém desse o remédio das 08:00 colidiria com o
registro do dia anterior.

Para `SE_NECESSARIO` fica nulo. O Postgres trata nulos como distintos numa
restrição única, então a mesma medicação se registra quantas vezes for
necessária — que é exatamente o comportamento que "se necessário" pede.

### 2.2 `dataInicio` e `dataFim` são `DateTime`, não `Date`

Com precisão de dia, uma prescrição suspensa às 10h ainda derivaria a dose das
14h — e o relatório de aderência acusaria como "sem registro" uma dose que o
médico mandou não dar. `suspenderMedicacao` grava `dataFim = agora`, e a dose
seguinte simplesmente não existe.

## 3. Modelo de dados

Segue a §4.5 da spec-mãe, com as correções da §2 acima marcadas **[corrigido]**.

**`Medicacao`** — `residenteId`, `farmaco`, `concentracao?`,
`formaFarmaceutica?`, `dose`, `via` (`ORAL` | `SUBLINGUAL` | `IM` | `EV` | `SC` |
`TOPICA` | `INALATORIA` | `OFTALMICA` | `OTOLOGICA` | `RETAL`), `tipo`
(`HORARIO_FIXO` | `SE_NECESSARIO`), `horarios` (lista de `HH:mm`), `diasSemana`
(lista 0-6; vazia = todos os dias), `instrucoes?`, `prescritorNome?`,
`prescritorConselho?`, **[corrigido]** `dataInicio: DateTime`, **[corrigido]**
`dataFim: DateTime?`, `ativa`, `motivoSuspensao?`, `substituiMedicacaoId?`.

- `dose` é texto livre ("1 comprimido", "10 gotas", "meio comprimido"): a
  unidade varia por fármaco e por apresentação, e um campo numérico forçaria a
  equipe a traduzir a receita antes de digitá-la.
- `horarios` e `diasSemana` são listas (`String[]` e `Int[]` no Postgres, que o
  Prisma suporta nativamente). Nada de texto separado por vírgula: a derivação
  itera sobre eles, e um parser de string seria um lugar a mais para errar.

**`AdministracaoMedicacao`** — `medicacaoId`, `residenteId`, **[corrigido]**
`horarioPrevisto: DateTime?` (nulo para `SE_NECESSARIO`), `registradoEm`,
`status` (`ADMINISTRADA` | `RECUSADA` | `NAO_ADMINISTRADA`), `motivo?`
(`IDOSO_HOSPITALIZADO` | `IDOSO_AUSENTE` | `MEDICAMENTO_EM_FALTA` |
`SUSPENSA_MEDICO` | `RECUSA_IDOSO` | `OUTRO`), `observacao?`.

Restrição única em (`medicacaoId`, `horarioPrevisto`) — a R4. É ela que impede
dupla marcação da mesma dose quando duas pessoas abrem a tela do turno ao mesmo
tempo.

Índices: `(residenteId, horarioPrevisto)` para o relatório de aderência, e
`(horarioPrevisto)` para o cruzamento da tela do turno, que consulta por janela
de tempo através de todos os residentes.

## 4. A derivação das doses

O coração da fase, e o módulo mais testado dela.

**`src/modules/health/doses.ts` é puro — não toca no banco.** Recebe as
prescrições e uma janela de tempo, devolve as instâncias de dose. É onde moram
os bugs de verdade — virada da meia-noite, dias da semana, bordas da vigência —
e é a única parte do sistema que dá para exercitar exaustivamente sem Postgres.

```ts
export type DosePrevista = {
  medicacaoId: string
  residenteId: string
  horarioPrevisto: Date
}

export function dosesPrevistas(
  prescricoes: PrescricaoParaDerivacao[],
  janela: { inicio: Date; fim: Date }
): DosePrevista[]
```

Uma dose existe quando **todas** as condições valem:

1. `tipo === 'HORARIO_FIXO'` — `SE_NECESSARIO` não tem dose prevista, por
   definição.
2. O instante (data da janela + `HH:mm`) cai em `[inicio, fim)` — fim
   exclusivo, para a dose das 14:00 pertencer à tarde e não aparecer duas vezes
   na fronteira dos turnos.
3. `diasSemana` está vazia ou contém o dia da semana **do instante**, não o da
   janela: numa janela que atravessa a meia-noite, os dois diferem.
4. O instante está dentro da vigência: `>= dataInicio` e
   (`dataFim` nulo ou `<= dataFim`).

**`ativa` não entra na derivação.** Filtrar por ele apagaria as doses passadas
de uma prescrição suspensa ontem, e o relatório de aderência do mês passado
mudaria sozinho. Quem manda é a vigência; `ativa` serve para listar o que está
em vigor hoje, e nada mais.

**Fuso e horário de verão:** os `horarios` são hora local. O Brasil não tem
horário de verão desde 2019, então nenhuma janela ganha ou perde uma hora. Se
voltar a ter, este é o módulo que precisa ser revisto — e o comentário no
arquivo diz isso.

## 5. Turnos

Reusam as fronteiras que a 2A fixou para as anotações de saúde: **manhã 6h–14h,
tarde 14h–22h, noite 22h–6h**. Uma segunda divisão para a mesma equipe seria
duas respostas para "em que turno isso aconteceu?".

```ts
export type NomeTurno = 'MANHA' | 'TARDE' | 'NOITE'
export type JanelaTurno = { turno: NomeTurno; inicio: Date; fim: Date }

export function janelaDoTurno(referencia: Date): JanelaTurno
export function turnoAnterior(janela: JanelaTurno): JanelaTurno
export function turnoSeguinte(janela: JanelaTurno): JanelaTurno
```

**O turno da noite atravessa a meia-noite.** A janela da noite de 24/08 vai de
24/08 às 22h a 25/08 às 6h. Às 2h da manhã do dia 25, `janelaDoTurno` devolve a
janela que **começou no dia anterior** — não uma que comece à meia-noite. É o
caso que mais erra numa implementação ingênua, e há teste para ele.

## 6. A tela do turno

`/turno`, item de menu para SAUDE e COORDENACAO, **primeiro da lista** — a §5.2
a chama de tela mais usada do sistema.

**Doses de horário fixo**, de todos os residentes, agrupadas por horário e não
por residente: a equipe percorre o corredor às 08:00 dando os remédios das
08:00 de todo mundo. Dentro de cada horário, os residentes em ordem de nome.
Cada dose mostra residente, fármaco, dose, via e instruções, e é marcável em um
toque.

**Estados de uma dose**, e a distinção entre os dois últimos é o ponto da fase:

| Estado | Quando | Na tela |
|---|---|---|
| Prevista | ainda não venceu | normal |
| Atrasada | venceu há mais de 30 min, sem registro | destaque âmbar |
| Administrada / Recusada / Não administrada | registrada | com o motivo, quando houver |
| Sem registro | o turno passou e ninguém marcou | destaque, e conta no indicador |

"Sem registro" **nunca** vira "não administrada" sozinha. A dose pode ter sido
dada e apenas não marcada, e afirmar o contrário grava mentira no prontuário.

**Medicações `SE_NECESSARIO`** ficam em seção separada, listando as prescrições
ativas de todos os residentes, registráveis sob demanda com motivo e
observação. Não aparecem entre as doses do turno porque não têm dose prevista.

**Navegação:** botões para o turno anterior e o seguinte, e o turno corrente
como padrão. Sem seletor de data: quem precisa de três semanas atrás está
fazendo auditoria, não plantão, e o lugar disso é o relatório de aderência.

**Sem notificação, de espécie alguma.** A §5.2 já decide: sem app nativo e sem
service worker, notificação em navegador móvel não é confiável o bastante para
função clínica. O destaque na tela aberta é o mecanismo que funciona.

## 7. Relatório de aderência

Por residente e por período, dentro do prontuário. Conta, sobre as doses
derivadas do período:

- **previstas** (o denominador)
- **administradas**, **recusadas**, **não administradas** — estas últimas
  quebradas por motivo
- **sem registro** — e o percentual, que é o indicador de qualidade que a
  coordenação acompanha
- **registradas fora do turno** — as tardias, derivadas de `registradoEm`
  comparado à janela do turno de `horarioPrevisto`

As tardias contam **dentro** de "administradas" (elas aconteceram), e aparecem
como coluna à parte: são uma medida de disciplina de registro, não de
administração.

## 8. Cabeçalho clínico

Ganha o bloco de **medicações ativas** que a §4.4 da spec-mãe prevê e que a 2A
deixou de fora de propósito. Lista fármaco, dose e horários das prescrições com
`ativa = true`, em ordem do primeiro horário do dia.

O grid do cabeçalho foi construído na 2A para receber mais um item sem
rearranjo.

## 9. Permissões e auditoria

| Entidade | Cria, edita e registra | Lê |
|---|---|---|
| `Medicacao`, `AdministracaoMedicacao` | COORDENACAO, SAUDE | COORDENACAO, SAUDE |

ADMINISTRATIVO não alcança nada — medicação é prontuário, e a §7 põe o
prontuário inteiro fora do alcance desse papel. A rota `/turno` some do menu
dele, e quem barra é o serviço.

As duas entidades entram em `EntidadeAuditada`; como esse tipo é uma união e a
tela de auditoria usa `Record<EntidadeAuditada, string>`, o typecheck exige
rótulo em português para cada uma antes de o projeto compilar.

Toda escrita audita dentro da transação. Toda tentativa negada vira
`ACESSO_NEGADO`, pelo mecanismo que já existe em `exigirPapel`.

**A leitura da tela do turno não audita `VISUALIZAR`.** Ela é aberta dezenas de
vezes por dia pela mesma pessoa, e uma linha por abertura afogaria a trilha sem
acrescentar rastro que a administração de cada dose — essa sim auditada — já não
dê.

## 10. Interface

**Celular, equipe de cuidado.** A tela do turno é desenhada para o telefone:
uma dose por linha, alvo de toque grande, e o botão de administrar sem
formulário no caminho. Recusar ou não administrar abre o motivo, porque aí a
informação importa.

**O quarto botão grande do prontuário.** A §9 da spec-mãe prevê quatro —
evolução, sinais vitais, intercorrência e **medicação** —, e a 2A entregou
três. O quarto entra agora, levando ao turno do residente.

Tudo em pt-BR, datas em `dd/mm/aaaa`, horários em `HH:mm`.

## 11. Testes

- **`doses.ts` exaustivamente, sem banco:** dose na fronteira exata do turno,
  janela que atravessa a meia-noite, `diasSemana` com o dia certo do lado certo
  da virada, dose antes de `dataInicio`, dose depois de `dataFim`, prescrição
  suspensa no meio do turno, `SE_NECESSARIO` não derivando nada.
- **`turno.ts` sem banco:** as três janelas, a virada da meia-noite às 2h, e a
  navegação anterior/seguinte atravessando o dia.
- Unitário por serviço, contra Postgres real, incluindo a recusa a
  ADMINISTRATIVO em cada função exportada.
- A restrição única impedindo dupla marcação da mesma dose.
- A recusa do registro tardio sem observação, e a aceitação com ela.
- A suspensão gravando `dataFim = agora`, e a dose seguinte deixando de existir.
- O relatório de aderência com uma dose em cada estado.
- E2E com o perfil SAUDE: abrir o turno, administrar uma dose, recusar outra com
  motivo, e ver o resultado no relatório de aderência do residente.
- E2E com o perfil ADMINISTRATIVO: `/turno` digitada na URL é recusada em
  pt-BR, e a recusa aparece na trilha.

## 12. Fora de escopo

Notificação de qualquer espécie (§5.2 da spec-mãe explica). Controle de estoque
de medicamento. Verificação de interação medicamentosa. Leitura de código de
barras. Tudo da Fase 3.

## 13. Questões deixadas em aberto

**A justificativa obrigatória no registro tardio** (§1.1). Decidida com o dono
do projeto, com o custo reconhecido: se ela empurrar a equipe a simplesmente
não registrar, o indicador de "sem registro" sobe, e a decisão volta à mesa com
dado.

**A lacuna entre suspender e prescrever** (§1.2). A tela oferece a substituta em
destaque logo após a suspensão, mas nada obriga a completar o segundo passo. Se
na prática as pessoas pararem no meio, o conserto é um alerta de "residente com
prescrição suspensa e sem substituta" — provavelmente na área de pendências, que
já existe.

**Doses de horário fixo em medicação de uso contínuo sem `dataFim`** acumulam
indefinidamente no relatório de aderência de períodos longos. Não é problema
hoje — trinta residentes, poucos meses de histórico —, mas é o primeiro lugar
onde o custo da derivação aparecerá se aparecer.

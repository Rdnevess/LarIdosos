# Pendências das listas e dos turnos

Registro do que ficou em aberto ao fechar o lote pedido em 27/08/2026:
paginação nas listas, filtro de usuários, cabeçalho e navegação, e a redução
dos turnos de três para dois. Mesmo formato dos de Fase 1, 2A, 2B, 3 e da
identidade visual: nenhum item impede o uso, e todos estão aqui para não
dependerem da memória de ninguém.

Dois itens deste documento — o **3** e o **5** — não nasceram do pedido. Saíram
da execução dele, e são o tipo de coisa que só aparece quando a mudança encosta
no sistema de verdade. O **3** foi respondido pelo Lar no mesmo dia, e a
resposta trocou a regra em vez de calibrar um número; o registro do problema
fica, porque o caminho até ela é o que explica a regra de hoje.

| # | Estado | Onde se resolve |
|---|---|---|
| 1. Pendências tem um limite para a tela toda | aberto, deliberado | se a segunda lista começar a sumir |
| 2. O tamanho de página não acompanha quem navega | aberto, deliberado | se alguém reclamar de reescolher |
| 3. O que conta como registro tardio | resolvido | 27/08/2026 — pelo Lar |
| 4. A faxina deixa arquivo órfão no volume de uploads | aberto, deliberado | quando o volume incomodar |
| 5. Cada rodada da suíte deixa ~18 residentes para trás | contornado | `npm run db:limpar-teste` |
| 6. A migration do turno fixou `America/Sao_Paulo` | resolvido, registrado | 27/08/2026 |
| 7. O filtro da auditoria continua carregando todos os usuários | aberto, deliberado | se as contas passarem de uma centena |

## 1. Pendências tem um limite para a tela toda, e não um por lista

**Situação:** a tela tem duas listas — exames em aberto e consultas agendadas —
e um único limite para as duas. Elas são fatiadas como uma sequência só, exames
primeiro.

**A consequência, que foi escolhida:** quando os exames em aberto passarem do
tamanho da página, **as consultas somem da primeira página**. Quem abrir a tela
verá vinte exames e nenhuma consulta, e precisará avançar para encontrá-las.

**Por que está assim:** foi a decisão do dono do sistema, tomada com essa
consequência à vista. A alternativa — um pager por lista — mantém as duas
sempre visíveis ao custo de dois controles na mesma tela e de dois parâmetros
na URL.

**Está fixado em teste**, e de propósito: `pendencias.test.ts` afirma que a
primeira página traz vinte exames e zero consultas. Não é para que ninguém
mude — é para que quem mudar saiba que está mudando isto, e não corrigindo um
defeito.

**Como saber se deu errado:** se alguém do plantão disser que "sumiram as
consultas". Aí o item vira um pager por lista, e o teste acima muda junto.

## 2. O tamanho de página não acompanha quem navega

**Situação:** o `?por=40` vive na URL da tela. Sair de Residentes e entrar em
Funcionários recomeça em 20, e voltar depois também.

**Por que está assim:** o estado na URL é o que torna a página compartilhável,
sobrevivente ao recarregar e funcional antes de qualquer script carregar — numa
tela aberta no corredor com sinal ruim, isso vale mais do que lembrar da
escolha. Guardar a preferência exigiria cookie ou coluna de usuário, e as duas
são estado novo para resolver um incômodo que ninguém relatou ainda.

**Quando revisitar:** se alguém reclamar de reescolher. A correção mais barata é
um cookie, não uma coluna: a escolha é de conveniência e não precisa sobreviver
a uma troca de dispositivo.

## 3. O que conta como registro tardio — resolvido

**Resolvido em 27/08/2026.** A pergunta que este item registrava foi feita ao
Lar, e a resposta mudou a regra em vez de calibrar um número.

**O que este item dizia:** que o limite de quatro horas era escolha declarada e
não clínica — calibrado para preservar a sensibilidade da regra anterior, e não
por nada que o Lar reconhecesse. A pergunta era *a partir de quantas horas de
atraso vale registrar que a dose saiu fora da hora?*

**A resposta não foi um número.** Atraso para o turno seguinte **não é
problema**: quem entra à noite e registra uma dose do dia está fazendo o
trabalho normal do plantão. O que precisa aparecer é a dose que atravessou uma
rotação inteira — o remédio do turno do dia que ninguém administrou e que só foi
lançado no dia seguinte, quando a equipe do dia voltou e o encontrou em aberto.

**A regra passou a ser essa:** tardio quando o turno de origem da dose já
voltou. Não há número a calibrar, e ela se ajusta sozinha se a divisão dos
turnos mudar de novo — o que já aconteceu uma vez.

**A propriedade que ficou registrada em teste:** o equivalente em horas varia de
doze a vinte e quatro, conforme onde a dose caiu dentro do turno, porque uma
dose do fim e uma do começo esperam o mesmo instante — o retorno do turno. É
diferente do defeito da primeira regra, em que 1h30 era tardia e 9h não era:
aqui o que se mede é uma rotação inteira, e a variação é a largura do próprio
turno.

**O laço anda pelas janelas em vez de somar 24 horas**, e isso é deliberado:
somar 24h dependeria de as janelas terem doze horas, e andar duas vezes
dependeria de haver exatamente dois turnos. As duas coisas já foram verdade e já
deixaram de ser. O laço só depende de a divisão do dia ser cíclica.

**Três regras em três dias, e vale dizer por quê:** a primeira ("fora do turno
da dose") media a coisa errada e só se revelou quando os turnos mudaram; a
segunda ("quatro horas") era consistente mas arbitrária, e sinalizava o que
acontece todo dia. A terceira veio de quem opera o Lar, e é a única que descreve
um fato do plantão em vez de um limite inventado.

## 4. A faxina deixa arquivo órfão no volume de uploads

**Situação:** `npm run db:limpar-teste` apaga o registro de `Documento`, e o
arquivo correspondente continua no volume. Depois da limpeza de 27/08/2026 há
**125 arquivos para 67 registros** — cerca de 58 órfãos.

**Por que está assim, e é deliberado:** apagar arquivo por dedução é pior que
deixar arquivo. O script recolhe cadastro de teste com base num padrão de nome;
estender esse padrão até o sistema de arquivos seria dar a ele o poder de apagar
um anexo clínico por causa de uma expressão regular.

**Por que não é urgente:** são arquivos de teste num volume de desenvolvimento,
e o disco que enche em produção é outro. Se incomodar, o caminho seguro é
comparar a lista de `caminhoArmazenamento` com o conteúdo do diretório e apagar
só o que não é citado por nenhum registro — leitura primeiro, exclusão depois.

**O que não fazer:** apagar o diretório inteiro. Ele guarda também os anexos dos
cadastros que a faxina preservou.

## 5. Cada rodada da suíte deixa cerca de dezoito residentes para trás

**Situação:** a suíte E2E roda contra o banco de desenvolvimento, e não contra
um banco efêmero por execução. Cada rodada completa deixa ~18 residentes, ~3
funcionários e ~3 usuários. Em 27/08/2026 o banco tinha acumulado **1027
residentes**, o equivalente a umas cinquenta e sete execuções.

**Por que isto não é cosmético:** com mil residentes e vinte por página, um
teste que cadastra alguém e o procura na lista não o encontra mais. Foi assim
que a paginação derrubou seis testes E2E que estavam corretos — e um deles
teria voltado ao verde **pelo motivo errado**: o `toHaveCount(0)` que prova que
um funcionário desligado sai do aviso passaria por ausência da página, e não por
ausência do registro. Entulho não produz só ruído; produz aprovação falsa.

**Como está contornado:** `npm run db:limpar-teste` recolhe os três tipos, com
as tabelas dependentes descobertas no catálogo do Postgres. Sem argumento ele
apenas confere e lista; `-- --apagar` apaga. Vale rodar quando a lista de
residentes começar a parecer estranha — ou, mais simples, antes de investigar
qualquer falha E2E que fale em "não encontrado".

**Onde se resolve de verdade:** um banco efêmero por execução. Foi descartado
quando a suíte nasceu, pelo motivo que continua valendo — rodar contra o banco
de desenvolvimento é o que permite abrir a tela e ver o estado que o teste
montou. A faxina é o preço disso, e agora ela existe.

## 6. A migration do turno fixou `America/Sao_Paulo` — resolvido, e registrado

**Resolvido em 27/08/2026**, e fica escrito porque é o tipo de decisão que, se
esquecida, não deixa sintoma — deixa registro de prontuário errado.

**O que quase deu errado:** a coluna `ocorridoEm` é `timestamp without time
zone` e o Prisma grava nela o **relógio UTC**. Um `EXTRACT(HOUR)` direto na
migration teria classificado pelo relógio de Greenwich: uma anotação das 16h
(19h UTC) viraria NOITE, e uma das 4h da madrugada (7h UTC) viraria DIA.
Exatamente ao contrário.

**Como se soube:** gravando pelo próprio cliente Prisma e lendo a coluna crua,
antes de escrever a conversão. Não foi deduzido do tipo da coluna.

**Por que este fuso:** é o que o `docker-compose.yml` declara para o serviço da
aplicação (`TZ: America/Sao_Paulo`), e é o relógio que a equipe do Lar viveu. O
contêiner do Postgres roda em UTC, então `current_setting('TIMEZONE')` daria a
resposta errada em produção. O próprio compose já registrava esta armadilha no
comentário do `TZ` — ela reapareceu aqui, dois meses depois, noutro lugar.

**O que sobrou como guarda:** a regra ficou escrita duas vezes, em TypeScript e
em SQL. `turno-migracao.test.ts` roda a expressão da migration contra o banco e
exige que ela concorde com `turnoDaHora` em cada borda, inclusive na travessia
da meia-noite.

## 7. O filtro da auditoria continua carregando todos os usuários

**Situação:** `listarUsuarios` não pagina, e é ela que preenche o `<select>` de
autor no filtro da trilha. A tela de usuários usa `consultarUsuarios`, que
pagina e filtra.

**Por que está assim:** paginar o `<select>` esconderia autores, e uma trilha
cujo filtro não oferece todo mundo parece incompleta a quem audita — que é
exatamente o contrário do que ela existe para ser.

**Quando revisitar:** se as contas passarem de uma centena. Um `<select>` com
cem opções já é difícil de usar, e aí a correção não é paginá-lo — é trocá-lo
por um campo de busca, como o da tela de usuários.

## O que este lote resolveu e vale registrar

Três coisas que não estavam no pedido e apareceram na execução.

**A regra do registro tardio media a coisa errada.** "Fora do turno da dose"
dependia de onde a fronteira do plantão caía, e não de quanto tempo passou: a
dose das 17:00 registrada às 18:30 era tardia — uma hora e meia, mas atravessou
a fronteira —, enquanto a das 08:00 registrada às 17:00 não era, com nove horas.
Com três turnos o defeito ficava disfarçado; com dois, a janela dobrou sem
ninguém ter pedido, e ele apareceu. A regra passou a medir horas de atraso.

**Registro adiantado deixou de contar como tardio.** A regra antiga o marcava,
porque estava fora da janela do turno. Dose dada um pouco cedo não é dose
atrasada, e chamar uma da outra grava afirmação falsa no prontuário.

**Três cópias do mapa de rótulos de turno foram apagadas**, e uma delas estava
com o acento corrompido. O dono é o `ROTULO_TURNO` de `@/lib/turno`, e as opções
do formulário do prontuário passaram a ser derivadas dele — uma lista escrita à
mão ali teria continuado oferecendo "Manhã" e "Tarde" para um enum que não os
aceita mais.

**E um detalhe de português que a mudança trouxe:** com três turnos os rótulos
eram todos femininos — manhã, tarde, noite — e "turno da {rótulo}" cabia fixo no
markup. Com DIA e NOITE os gêneros divergem, e a tela dizia "Turno da dia". A
forma neutra — "Turno: Dia" — resolve nas três telas sem um mapa de artigos para
dois valores.

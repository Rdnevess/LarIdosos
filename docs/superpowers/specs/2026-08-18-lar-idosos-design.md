# Sistema de Gestão — Lar de Idosos

**Data:** 2026-08-18
**Status:** Design aprovado, aguardando plano de implementação

## 1. Contexto e objetivo

O Lar é uma **ILPI filantrópica com convênio público**, atende cerca de **30 idosos** e tem de **3 a 8 pessoas** que usarão o sistema. Hoje **todo o controle é feito em papel**: não há sistema anterior, não há dados a migrar por importação automática, e não há formato legado a respeitar.

O objetivo é um aplicativo web único que cubra quatro necessidades:

1. Cadastro de idosos (residentes), seus responsáveis e documentos
2. Cadastro de funcionários
3. Prontuário: anotações de saúde, sinais vitais, exames, consultas e controle de medicação
4. Controle financeiro com prestação de contas ao órgão conveniador

O sistema é usado em **celular pela equipe de cuidado** (registro à beira do leito) e em **computador pelo administrativo**. Não há exigência de funcionamento offline.

### Critérios de sucesso

- A equipe registra a rotina de plantão pelo celular sem recorrer ao caderno
- A coordenação encontra qualquer informação de um residente sem abrir pasta física
- A prestação de contas do convênio é montada a partir de dados já lançados, com comprovantes anexados no momento da despesa — não reunidos no fim do período
- Nenhum dado sensível é acessível sem autenticação, e todo acesso a prontuário fica registrado

## 2. Arquitetura

### 2.1 Stack

| Camada | Escolha |
|---|---|
| Aplicação | Next.js 15 (App Router), TypeScript, React Server Components + Server Actions |
| ORM / banco | Prisma + PostgreSQL 18 |
| Autenticação | Auth.js (NextAuth v5), credenciais e-mail + senha, sessão em JWT httpOnly (ver §2.4) |
| Validação | Zod (compartilhado entre formulário e serviço) |
| UI | Tailwind CSS + shadcn/ui, interface inteira em pt-BR |
| Testes | Vitest (serviços, contra Postgres real) + Playwright (fluxos críticos) |
| Implantação | Docker Compose em VPS própria: app + Postgres + Caddy (HTTPS automático) |

Descartadas: API separada + SPA (cerimônia sem retorno para 8 usuários) e Django/HTMX (o Admin não resolve as telas móveis, que são metade do uso).

### 2.2 Estrutura de módulos

```
src/
  modules/
    auth/        sessão, papéis, hash de senha
    residents/   residentes, responsáveis, documentos, anotações gerais
    staff/       funcionários
    health/      prontuário, exames, medicação
    finance/     fontes de recurso, lançamentos, prestação de contas
    audit/       trilha de auditoria (transversal)
  lib/           prisma, zod, storage de arquivos, datas, formatação pt-BR
  app/           rotas e telas (App Router)
```

Cada módulo expõe uma **camada de serviço**: funções `(ctx, dados)` que recebem o contexto do usuário autenticado e falam com o Prisma. As Server Actions são cascas finas — autenticam, validam com Zod, chamam o serviço, revalidam a rota.

Consequências desta separação, e a razão de ela existir:

- A regra de negócio é testável sem HTTP e sem navegador
- A **verificação de permissão vive no serviço**, não na interface (ver §7)
- Uma futura mudança de versão do Next.js não alcança a lógica de domínio

### 2.3 Armazenamento de arquivos

Arquivos (documentos, exames, comprovantes fiscais) são gravados em um volume Docker montado em `/data/uploads`, com nome em UUID e metadados no Postgres (`Documento`).

São servidos **exclusivamente** por uma rota autenticada que verifica a permissão do usuário sobre aquele arquivo específico antes de entregar os bytes. Nenhum arquivo é acessível por URL pública ou adivinhável.

Não se usa S3 ou storage externo: custo desnecessário na escala do projeto e mais uma credencial sob custódia.

### 2.4 Sessão e revogação de acesso

O Auth.js v5 só oferece sessão persistida em banco para providers OAuth; com provider de credenciais, a sessão é obrigatoriamente um **JWT**. O risco disso é conhecido: desativar um usuário não invalidaria o token dele até a expiração — inaceitável quando o acesso dá vista a prontuário.

A mitigação é explícita e obrigatória: o callback de sessão **consulta o banco a cada requisição** e recusa a sessão se o usuário estiver inativo, se o papel tiver mudado (recarregando o papel atual) ou se a senha tiver sido alterada após a emissão do token (`senhaAlteradaEm` posterior ao `iat`). Em 8 usuários, o custo de uma consulta por requisição é irrelevante; a propriedade de revogação imediata, não.

Cookie `httpOnly`, `secure`, `sameSite=lax`, expiração de 12 horas — cobre um plantão sem deixar sessão viva indefinidamente em celular compartilhado.

### 2.5 Identificadores

Todas as entidades usam **CUID** como chave primária, exposta nas URLs. Nada de inteiro sequencial em rota — `/residentes/1` convida a enumerar registros de pessoas.

## 3. Fases de entrega

Cada fase é utilizável isoladamente.

### Fase 1 — Núcleo cadastral

Autenticação, papéis, gestão de usuários, cadastro de residentes (com histórico de grau de dependência), responsáveis, documentos anexos, cadastro de funcionários, anotações gerais e trilha de auditoria.

Ao fim da Fase 1 o Lar substitui as pastas de papel.

### Fase 2A — Prontuário

Cabeçalho clínico (alergias, condições crônicas, restrições alimentares, grau vigente), anotações de saúde, sinais vitais, exames com anexo e controle de pendências, consultas externas, vacinas e linha do tempo unificada.

Ao fim da 2A o caderno de plantão é substituído.

### Fase 2B — Medicação

Esquema medicamentoso, mapa do turno, registro de administração dose a dose e relatório de aderência.

Separada da 2A de propósito: é o módulo mais crítico do sistema e se beneficia de a equipe já estar habituada à ferramenta antes de confiar a ela o controle de medicação.

### Fase 3 — Financeiro e prestação de contas

Fontes de recurso, contas bancárias, rubricas do plano de trabalho, lançamentos com comprovante, contribuição dos residentes e relatórios de prestação de contas.

**Bloqueio explícito:** a Fase 3 não começa antes de recebidos os modelos de relatório exigidos pelo órgão conveniador (ver §11).

## 4. Modelo de dados

Convenções gerais: as entidades de domínio têm `criadoEm`, `atualizadoEm` e `criadoPorId` (este último ausente apenas nos registros criados pelo seed inicial); campos marcados com `?` são opcionais; exclusão é sempre lógica (§6, R1). `LogAuditoria` é exceção deliberada: tem apenas `criadoEm`, por ser append-only (§4.7).

### 4.1 Autenticação e usuários

**`Usuario`** — `email` (único), `senhaHash` (Argon2id), `nome`, `papel` (`COORDENACAO` | `SAUDE` | `ADMINISTRATIVO`), `ativo`, `funcionarioId?` (único), `ultimoAcessoEm?`, `senhaAlteradaEm`.

`Usuario` e `Funcionario` são entidades distintas: nem todo funcionário tem acesso, um voluntário pode ter conta sem ser funcionário registrado, e revogar acesso não pode apagar o histórico de autoria.

Tabelas de sessão conforme o adapter Prisma do Auth.js.

### 4.2 Residentes

**`Residente`**

- Identificação: `nomeCompleto`, `nomeSocial?`, `dataNascimento`, `sexo`, `estadoCivil?`, `naturalidade?`, `nacionalidade` (padrão "Brasileira"), `religiao?`, `escolaridade?`
- Documentos: `cpf?`, `rg?`, `orgaoEmissorRg?`, `cns?` (cartão SUS)
- Institucional: `dataAdmissao`, `origemAdmissao?`, `motivoAdmissao?`, `quarto?`, `leito?`
- Saúde/benefício: `planoSaude?`, `numeroPlanoSaude?`, `beneficioTipo?` (`APOSENTADORIA` | `BPC` | `PENSAO` | `NENHUM`), `beneficioNumero?`, `beneficioValor?`
- Situação: `status` (`ATIVO` | `DESLIGADO` | `FALECIDO`), `dataSaida?`, `motivoSaida?`, `observacaoSaida?`

`quarto` e `leito` são campos de texto, não entidades. Um modelo Ala→Quarto→Leito com mapa de ocupação não se paga em 30 residentes; o dado fica registrado e permite migração futura se surgir a necessidade.

**`AvaliacaoDependencia`** — `residenteId`, `grau` (`I` | `II` | `III`, conforme RDC 502/2021 da Anvisa), `dataAvaliacao`, `avaliadorNome`, `avaliadorId?`, `justificativa?`.

Histórico, não campo. O grau é reavaliado periodicamente e é usado em relatórios de convênio; um relatório de março precisa sair com o grau vigente em março.

**`Responsavel`** — `residenteId`, `nome`, `parentesco`, `cpf?`, `telefonePrincipal`, `telefoneSecundario?`, `email?`, endereço (`logradouro?`, `numero?`, `complemento?`, `bairro?`, `cidade?`, `uf?`, `cep?`), e três marcações independentes: `ehResponsavelLegal`, `ehContatoEmergencia`, `autorizadoVisitar`.

**`Documento`** — `tipo` (`RG` | `CPF` | `CNS` | `CERTIDAO` | `LAUDO` | `PROCURACAO` | `TERMO_RESPONSABILIDADE` | `TERMO_LGPD` | `FOTO` | `EXAME` | `COMPROVANTE_FISCAL` | `CONSELHO_PROFISSIONAL` | `OUTRO`), `descricao?`, `nomeArquivoOriginal`, `caminhoArmazenamento`, `mimeType`, `tamanhoBytes`, `hashSha256`, `residenteId?`, `funcionarioId?`.

Mecanismo único de arquivo para todo o sistema. Entidades que precisam de anexo (`Exame`, `Consulta`, `Lancamento`) referenciam `documentoId`.

**`Anotacao`** — `residenteId`, `categoria` (`COMPORTAMENTO` | `VISITA_FAMILIA` | `OCORRENCIA` | `SOCIAL` | `JURIDICO` | `OUTRO`), `texto`, `editavelAte`, `retificaAnotacaoId?`.

Deliberadamente separada de `AnotacaoSaude`: o perfil administrativo lê e escreve aqui, mas não acessa o prontuário clínico. Uma tabela única tornaria essa separação impraticável.

Não existe campo genérico "observações" espalhado pelo cadastro. Todo texto livre é anotação datada e assinada — campo de observação solto é onde informação importante morre sem autor nem data.

### 4.3 Funcionários

**`Funcionario`** — `nomeCompleto`, `cpf`, `rg?`, `cargo`, `vinculo` (`CLT` | `VOLUNTARIO` | `PRESTADOR` | `ESTAGIO`), `dataAdmissao`, `dataDesligamento?`, `motivoDesligamento?`, contatos, endereço, e registro profissional: `conselhoSigla?` (COREN, CRM, CRN, CREFITO, CRP, CRESS), `conselhoNumero?`, `conselhoUf?`, `conselhoValidade?`, `ativo`.

O registro em conselho com validade é o que a fiscalização sanitária cobra de uma ILPI.

### 4.4 Prontuário (Fase 2A)

**`CondicaoCronica`** — `residenteId`, `descricao`, `cid10?`, `dataDiagnostico?`, `ativa`.

**`Alergia`** — `residenteId`, `agente`, `tipo` (`MEDICAMENTO` | `ALIMENTO` | `OUTRO`), `gravidade` (`LEVE` | `MODERADA` | `GRAVE`), `reacao?`.

**`RestricaoAlimentar`** — `residenteId`, `descricao`, `ativa`.

Essas três alimentam o **cabeçalho fixo** da ficha do residente, junto com o grau de dependência vigente e as medicações ativas. É a informação que a equipe precisa ver antes de encostar na pessoa; não pode estar a três cliques de distância.

**`AnotacaoSaude`** — `residenteId`, `categoria` (`EVOLUCAO` | `INTERCORRENCIA` | `ALIMENTACAO` | `SONO` | `HIGIENE` | `COMPORTAMENTO` | `QUEDA`), `turno` (`MANHA` | `TARDE` | `NOITE`), `texto`, `gravidade?`, `conduta?`, `ocorridoEm`, `editavelAte`, `retificaAnotacaoSaudeId?`.

**`SinalVital`** — `residenteId`, `aferidoEm`, `pressaoSistolica?`, `pressaoDiastolica?`, `frequenciaCardiaca?`, `frequenciaRespiratoria?`, `temperatura?`, `saturacaoO2?`, `glicemia?`, `peso?`, `observacao?`.

Campos numéricos separados, não texto livre — é o que permite mostrar tendência de pressão e de peso ao longo do tempo, que é onde o dado passa a valer alguma coisa.

**`Exame`** — `residenteId`, `tipo`, `dataSolicitacao?`, `dataRealizacao?`, `dataResultado?`, `solicitanteNome?`, `laboratorio?`, `status` (`SOLICITADO` | `AGENDADO` | `REALIZADO` | `RESULTADO_RECEBIDO` | `CANCELADO`), `resumoResultado?`, `documentoId?`.

O `status` existe para sustentar a tela **"exames pendentes"**, que na prática é a razão de ser do módulo: exame solicitado e esquecido é o problema real em ILPI.

**`Consulta`** — `residenteId`, `dataHora`, `especialidade`, `profissional?`, `local?`, `motivo?`, `conduta?`, `encaminhamento?`, `dataRetorno?`, `documentoId?`.

**`Vacina`** — `residenteId`, `imunizante`, `dose`, `dataAplicacao`, `lote?`, `localAplicacao?`.

Barato de modelar e é das primeiras coisas que a vigilância sanitária pede.

### 4.5 Medicação (Fase 2B)

**`Medicacao`** — `residenteId`, `farmaco`, `concentracao?`, `formaFarmaceutica?`, `dose`, `via` (`ORAL` | `SUBLINGUAL` | `IM` | `EV` | `SC` | `TOPICA` | `INALATORIA` | `OFTALMICA` | `OTOLOGICA` | `RETAL`), `tipo` (`HORARIO_FIXO` | `SE_NECESSARIO`), `horarios` (lista de `HH:mm`), `diasSemana` (lista 0-6; vazia = todos os dias), `instrucoes?`, `prescritorNome?`, `prescritorConselho?`, `dataInicio`, `dataFim?`, `ativa`, `motivoSuspensao?`, `substituiMedicacaoId?`.

**`AdministracaoMedicacao`** — `medicacaoId`, `residenteId`, `horarioPrevisto?` (nulo para `SE_NECESSARIO`), `registradoEm`, `status` (`ADMINISTRADA` | `RECUSADA` | `NAO_ADMINISTRADA`), `motivo?` (`IDOSO_HOSPITALIZADO` | `IDOSO_AUSENTE` | `MEDICAMENTO_EM_FALTA` | `SUSPENSA_MEDICO` | `RECUSA_IDOSO` | `OUTRO`), `observacao?`.

Restrição única em (`medicacaoId`, `horarioPrevisto`) — impede dupla marcação da mesma dose.

### 4.6 Financeiro (Fase 3)

**`FonteRecurso`** — `nome`, `tipo` (`CONVENIO_PUBLICO` | `DOACAO` | `CONTRIBUICAO_RESIDENTE` | `EVENTO` | `PROPRIO`), `orgaoConcedente?`, `numeroTermo?`, `vigenciaInicio?`, `vigenciaFim?`, `valorPrevisto?`, `contaBancariaId?`, `ativa`, `observacao?`.

Entidade central do módulo: todo lançamento pertence obrigatoriamente a uma fonte.

**`ContaBancaria`** — `banco`, `agencia`, `numeroConta`, `tipo` (`CORRENTE` | `POUPANCA` | `APLICACAO`), `titular`, `saldoInicial`, `dataSaldoInicial`, `exclusivaDeConvenio`, `ativa`.

**`RubricaPlanoTrabalho`** — `fonteRecursoId`, `codigo?`, `nome`, `valorPrevisto`, `observacao?`.

**`CategoriaLancamento`** — `nome`, `natureza` (`RECEITA` | `DESPESA`), `categoriaPaiId?`, `ativa`. Hierarquia rasa (dois níveis).

**`Fornecedor`** — `nome`, `documento`, `tipoDocumento` (`CNPJ` | `CPF`), `telefone?`, `email?`, `ativo`.

**`Lancamento`** — `natureza` (`RECEITA` | `DESPESA`), `descricao`, `valor`, `dataCompetencia`, `dataMovimento?`, `status` (`PREVISTO` | `REALIZADO` | `CANCELADO`), `fonteRecursoId`, `contaBancariaId`, `categoriaId`, `rubricaId?`, `fornecedorId?`, `residenteId?`, `formaPagamento?`, `numeroDocumentoFiscal?`, `documentoId?` (comprovante), `conciliadoEm?`, `conciliadoPorId?`, `motivoCancelamento?`, `observacao?`.

`dataCompetencia` e `dataMovimento` são campos distintos e não intercambiáveis; confundi-los é o que emperra prestação de contas.

**`ContribuicaoResidente`** — `residenteId`, `percentual`, `valorBaseBeneficio`, `vigenciaInicio`, `vigenciaFim?`, `observacao?`.

Modelada com vigência porque a contribuição é percentual sobre o benefício (art. 35, §2º da Lei 10.741/2003), e o benefício é reajustado todo ano. Guardar apenas "valor da mensalidade" quebraria na primeira virada de exercício e corromperia o histórico.

### 4.7 Auditoria

**`LogAuditoria`** — `usuarioId?`, `usuarioEmail` (cópia no momento do evento), `acao` (`CRIAR` | `ATUALIZAR` | `EXCLUIR` | `VISUALIZAR` | `LOGIN` | `LOGIN_FALHA` | `LOGOUT` | `EXPORTAR` | `DOWNLOAD`), `entidade`, `entidadeId?`, `residenteId?`, `diff?` (JSON), `ip?`, `userAgent?`, `criadoEm`.

Tabela **append-only**: não há operação de edição nem de exclusão, para nenhum papel, incluindo coordenação. Log que o administrador pode limpar não prova nada.

## 5. Controle de administração de medicação

Este é o componente mais complexo do sistema e a decisão de desenho que mais importa.

### 5.1 Doses previstas são derivadas, não materializadas

A prescrição (`Medicacao`) é a fonte da verdade. Para uma data qualquer, o sistema **calcula** as doses previstas a partir do esquema (horários × dias da semana × vigência). `AdministracaoMedicacao` persiste **somente o que aconteceu**.

A alternativa considerada e descartada foi um job noturno criando registros "pendente" para o dia seguinte. Ela exige cron, duplica estado, quebra quando a prescrição muda no meio do dia ou retroativamente, e — o problema decisivo — converter pendências em "não administrada" no fim do dia **registra uma afirmação falsa no prontuário**: a dose pode ter sido dada e apenas não marcada.

Com o modelo derivado, a distinção fica honesta: uma dose sem registro aparece como **"sem registro"**, nunca como "não administrada". O percentual de doses sem registro por turno vira, ele próprio, um indicador de qualidade para a coordenação acompanhar.

### 5.2 Tela do turno

A tela mais usada do sistema. Todos os residentes × doses do turno, agrupadas por horário, cada dose marcável em um toque. Horário vencido há mais de 30 minutos recebe destaque visual. Medicações `SE_NECESSARIO` ficam em seção separada, registráveis sob demanda com o motivo.

Sem notificação push: sem app nativo e sem service worker, notificação em navegador móvel não é confiável o bastante para uma função clínica. O destaque na tela aberta é o mecanismo que funciona.

### 5.3 Relatório de aderência

Por residente e por período: doses previstas (derivadas), administradas, recusadas, não administradas com motivo, e sem registro.

## 6. Regras de negócio

| # | Regra |
|---|---|
| R1 | Exclusão é sempre lógica. Nenhuma entidade de domínio é removida fisicamente do banco. |
| R2 | O grau de dependência vigente é o da `AvaliacaoDependencia` mais recente por `dataAvaliacao`. Relatórios por período usam o grau vigente **naquele período**, não o atual. |
| R3 | `Anotacao` e `AnotacaoSaude` são editáveis pelo autor por 15 minutos após a criação (`editavelAte`). Depois disso, correção só por nova anotação vinculada à original via `retifica*Id`. A original nunca é alterada. |
| R4 | Doses previstas são derivadas do esquema medicamentoso. `AdministracaoMedicacao` só existe para eventos ocorridos. Restrição única em (`medicacaoId`, `horarioPrevisto`). |
| R5 | Alteração de dose ou horário encerra a `Medicacao` vigente (`dataFim`, `ativa = false`) e cria uma nova com `substituiMedicacaoId` apontando para a anterior. Prescrição não é editada no lugar. |
| R6 | Lançamento de despesa com fonte do tipo `CONVENIO_PUBLICO` só pode assumir `status = REALIZADO` se tiver `rubricaId` e `documentoId` (comprovante) preenchidos. Validação no serviço, não aviso na tela. |
| R7 | Conta bancária marcada como `exclusivaDeConvenio` só aceita lançamentos da fonte de recurso à qual está vinculada. |
| R8 | `rubricaId` deve pertencer à mesma `fonteRecursoId` do lançamento. |
| R9 | `ContribuicaoResidente.percentual` é limitado a 70% (Lei 10.741/2003, art. 35, §2º). Vigências de um mesmo residente não podem se sobrepor. |
| R10 | A geração mensal de contribuições é **disparada manualmente** pelo administrativo (não há job automático), e cria lançamentos com `status = PREVISTO`, calculados como `percentual × valorBaseBeneficio` da vigência ativa no mês de competência. A confirmação para `REALIZADO` é sempre manual, lançamento a lançamento. Gerar duas vezes o mesmo mês não duplica lançamentos. |
| R11 | Toda verificação de permissão ocorre na camada de serviço. Nenhuma decisão de acesso depende exclusivamente da interface. |
| R12 | Todo acesso a dado sensível (prontuário, exame, documento, lançamento financeiro) gera registro em `LogAuditoria`, inclusive leitura. |

## 7. Permissões

| Papel | Acessa | Não acessa |
|---|---|---|
| **COORDENACAO** | Tudo, incluindo gestão de usuários e consulta da auditoria | — |
| **SAUDE** | Prontuário completo, medicação, sinais vitais, exames, anotações gerais, consulta ao cadastro de residentes | Financeiro, cadastro de funcionários, gestão de usuários |
| **ADMINISTRATIVO** | Cadastro de residentes e responsáveis, documentos, funcionários, financeiro completo, anotações gerais | Prontuário clínico, exames, medicação |

Dois pontos de fronteira que a tabela acima não resolve sozinha:

- **`AvaliacaoDependencia` é criada por SAUDE ou COORDENACAO**, não pelo administrativo. Embora o grau apareça na ficha cadastral, atribuí-lo é ato de avaliação clínica.
- **ADMINISTRATIVO tem leitura do grau de dependência** (vigente e histórico), e apenas dele, dentro do conjunto de dados clínicos. Sem isso o relatório de residentes por grau (§10, item 6) seria impossível de emitir por quem monta a prestação de contas. Nenhum outro dado de prontuário é legível por esse papel.

A verificação vive na camada de serviço: a interface esconde o que o usuário não pode ver, e o serviço **recusa** ainda que a requisição chegue por outro caminho. Cada recusa tem teste automatizado.

Permissão implementada apenas no componente React é a falha de segurança mais comum nesta classe de aplicação, e a mais difícil de perceber — porque a tela parece correta.

## 8. Auditoria e LGPD

Prontuário é dado pessoal sensível (LGPD, art. 11). A base legal para o tratamento assistencial é a tutela da saúde e a execução de política pública, o que dispensa consentimento para o uso assistencial mas **exige** medida de segurança proporcional.

Decisões concretas decorrentes disso:

- Identificadores opacos (CUID) em todas as URLs
- Arquivos servidos apenas por rota autenticada, com verificação de permissão por arquivo
- Senhas com Argon2id; HTTPS obrigatório via Caddy
- Backup criptografado antes de deixar a VPS
- Termo de ciência do residente/responsável anexado ao cadastro (`Documento` tipo `TERMO_LGPD`)
- Auditoria de **toda escrita** e de **leitura de dado sensível**. Leitura de tela comum não é auditada: volume que ninguém consegue consultar não é controle, é custo de disco
- Exclusão sempre lógica. Prontuário tem guarda obrigatória de **20 anos** após o último registro (Resolução CFM 1.821/2007), o que se sobrepõe a eventual pedido de eliminação

A coordenação tem tela de consulta da auditoria, filtrável por usuário, entidade e período.

## 9. Interface

**Mobile (equipe de cuidado).** A ficha do residente no celular abre com quatro botões grandes — *evolução*, *sinais vitais*, *intercorrência*, *medicação* — cada um levando a um formulário de um campo, com data/hora e autor preenchidos automaticamente. Se registrar der trabalho, ninguém registra, e o sistema vira um caderno digital vazio.

**Desktop (administrativo).** Tabelas densas, filtros, formulários completos de cadastro e lançamento, telas de relatório.

**Linha do tempo do residente.** Evoluções, sinais vitais, exames, consultas, intercorrências e mudanças de grau em fluxo cronológico único, filtrável por tipo. É como a equipe pensa sobre o idoso — "o que aconteceu com ela nas últimas semanas" — e não "abra a aba de exames".

**Localização.** Interface inteira em pt-BR; datas em `dd/mm/aaaa`; moeda em `R$ 0.000,00`; validação de CPF e CNPJ com dígito verificador; máscaras de telefone e CEP.

## 10. Relatórios de prestação de contas

1. Demonstrativo de receitas e despesas por fonte e período
2. Previsto × executado por rubrica (por convênio)
3. Relação de pagamentos: data, favorecido, CNPJ/CPF, documento fiscal, rubrica, valor
4. Conciliação bancária do período
5. Extrato de contribuições por residente
6. Relação de residentes por grau de dependência em uma data de referência

Cada um exportável em **PDF** (para anexar ao processo) e **CSV** (para o contador e para trabalho em planilha).

A conciliação é manual — marcar lançamento como conciliado contra o extrato. Importação de OFX fica de fora: cada banco tem sua peculiaridade de formato e isso se torna um projeto próprio.

## 11. Dependências externas

| Dependência | Impacto |
|---|---|
| **Modelos de relatório do órgão conveniador** | Bloqueia o início da Fase 3. Os modelos existem e serão fornecidos; as exportações serão desenhadas para bater com eles, evitando retrabalho manual na entrega. |
| **Contador externo** | Exportação CSV/PDF é suficiente. Não há layout de importação específico a atender. |

## 12. Testes

**Serviços (Vitest), contra Postgres real em container.** Não SQLite: as diferenças de tipo e de constraint fazem o teste passar e a produção quebrar.

Cobertura concentrada onde o erro custa caro:

- Cálculo de contribuição com vigência, incluindo virada de exercício e limite de 70%
- Derivação de doses previstas: horários, dias da semana, vigência, prescrição alterada no meio do período
- Validações de convênio (R6, R7, R8)
- Cada recusa de permissão, para cada papel e cada serviço
- Grau de dependência vigente em data retroativa (R2)
- Imutabilidade de anotação após a janela de edição (R3)

**Ponta a ponta (Playwright), poucos fluxos:** login; cadastrar residente; registrar administração de dose; lançar despesa de convênio com comprovante.

O desenvolvimento segue TDD — teste antes da implementação, em cada tarefa do plano.

## 13. Operação

**Implantação.** `docker-compose` com três serviços: app, Postgres e Caddy. Migrations do Prisma aplicadas no start do container. Seed inicial com usuário de coordenação, categorias de lançamento e tipos de documento.

**Backup.** `pg_dump` diário mais cópia do volume `/data/uploads`, criptografados e enviados por rclone para armazenamento fora da VPS. **O procedimento de restauração é testado e documentado** como parte da entrega da Fase 1. Backup nunca verificado é backup que não existe — e o sistema guarda o prontuário de 30 pessoas em disco único.

**Logs.** Log da aplicação em arquivo rotacionado no volume.

**Carga inicial.** Os ~30 residentes são digitados manualmente. Não se constrói importador para um evento único que leva uma tarde.

## 14. Fora de escopo

Registrado explicitamente para evitar reabertura:

- Funcionamento offline, PWA com fila de sincronização
- Aplicativo nativo, notificações push
- Importação de extrato bancário (OFX)
- Contabilidade: balanço patrimonial, DRE, escrituração. O escopo é controle gerencial e prestação de contas do convênio; uma contabilidade paralela produziria dois números divergentes para a mesma realidade, o que é pior que não ter nenhum
- Mapa de leitos e gestão de ocupação
- Escala de plantão, controle de ponto e folha de pagamento
- Portal de acesso para familiares
- Integração com laboratório ou sistema do SUS
- Importador de dados legados
- Suporte a múltiplas instituições na mesma instalação

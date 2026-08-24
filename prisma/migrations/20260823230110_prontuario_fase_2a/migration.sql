-- Fase 2A — prontuário: as oito entidades que substituem o caderno de plantão.
--
-- Gerada por `prisma migrate diff` contra o banco de desenvolvimento, e não
-- por `migrate dev`: os comentários da migration
-- `20260820213908_documento_funcionario_fk` foram editados depois de ela ter
-- sido aplicada, então `migrate dev` pede um reset do banco antes de gerar
-- qualquer migration nova. Ver o aviso no README.
--
-- Os índices não são decoração: `(status, data)` sustenta a área de
-- pendências, que varre todos os residentes; `(residenteId, data)` sustenta a
-- linha do tempo, que são cinco consultas por residente.

-- CreateEnum
CREATE TYPE "TipoAlergia" AS ENUM ('MEDICAMENTO', 'ALIMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "Gravidade" AS ENUM ('LEVE', 'MODERADA', 'GRAVE');

-- CreateEnum
CREATE TYPE "CategoriaAnotacaoSaude" AS ENUM ('EVOLUCAO', 'INTERCORRENCIA', 'ALIMENTACAO', 'SONO', 'HIGIENE', 'COMPORTAMENTO', 'QUEDA');

-- CreateEnum
CREATE TYPE "Turno" AS ENUM ('MANHA', 'TARDE', 'NOITE');

-- CreateEnum
CREATE TYPE "StatusExame" AS ENUM ('SOLICITADO', 'AGENDADO', 'REALIZADO', 'RESULTADO_RECEBIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusConsulta" AS ENUM ('AGENDADA', 'REALIZADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "condicoes_cronicas" (
    "id" TEXT NOT NULL,
    "residenteId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "cid10" TEXT,
    "dataDiagnostico" DATE,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "condicoes_cronicas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alergias" (
    "id" TEXT NOT NULL,
    "residenteId" TEXT NOT NULL,
    "agente" TEXT NOT NULL,
    "tipo" "TipoAlergia" NOT NULL,
    "gravidade" "Gravidade" NOT NULL,
    "reacao" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "alergias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restricoes_alimentares" (
    "id" TEXT NOT NULL,
    "residenteId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "restricoes_alimentares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anotacoes_saude" (
    "id" TEXT NOT NULL,
    "residenteId" TEXT NOT NULL,
    "categoria" "CategoriaAnotacaoSaude" NOT NULL,
    "turno" "Turno" NOT NULL,
    "texto" TEXT NOT NULL,
    "gravidade" "Gravidade",
    "conduta" TEXT,
    "ocorridoEm" TIMESTAMP(3) NOT NULL,
    "editavelAte" TIMESTAMP(3) NOT NULL,
    "retificaAnotacaoSaudeId" TEXT,
    "autorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "anotacoes_saude_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sinais_vitais" (
    "id" TEXT NOT NULL,
    "residenteId" TEXT NOT NULL,
    "aferidoEm" TIMESTAMP(3) NOT NULL,
    "pressaoSistolica" INTEGER,
    "pressaoDiastolica" INTEGER,
    "frequenciaCardiaca" INTEGER,
    "frequenciaRespiratoria" INTEGER,
    "temperatura" DECIMAL(4,1),
    "saturacaoO2" INTEGER,
    "glicemia" INTEGER,
    "peso" DECIMAL(5,2),
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "sinais_vitais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exames" (
    "id" TEXT NOT NULL,
    "residenteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataSolicitacao" DATE,
    "dataRealizacao" DATE,
    "dataResultado" DATE,
    "solicitanteNome" TEXT,
    "laboratorio" TEXT,
    "status" "StatusExame" NOT NULL DEFAULT 'SOLICITADO',
    "resumoResultado" TEXT,
    "documentoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "exames_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultas" (
    "id" TEXT NOT NULL,
    "residenteId" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "especialidade" TEXT NOT NULL,
    "profissional" TEXT,
    "local" TEXT,
    "motivo" TEXT,
    "conduta" TEXT,
    "encaminhamento" TEXT,
    "dataRetorno" DATE,
    "status" "StatusConsulta" NOT NULL DEFAULT 'AGENDADA',
    "documentoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "consultas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacinas" (
    "id" TEXT NOT NULL,
    "residenteId" TEXT NOT NULL,
    "imunizante" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "dataAplicacao" DATE NOT NULL,
    "lote" TEXT,
    "localAplicacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "vacinas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "condicoes_cronicas_residenteId_ativa_idx" ON "condicoes_cronicas"("residenteId", "ativa");

-- CreateIndex
CREATE INDEX "alergias_residenteId_ativa_idx" ON "alergias"("residenteId", "ativa");

-- CreateIndex
CREATE INDEX "restricoes_alimentares_residenteId_ativa_idx" ON "restricoes_alimentares"("residenteId", "ativa");

-- CreateIndex
CREATE INDEX "anotacoes_saude_residenteId_ocorridoEm_idx" ON "anotacoes_saude"("residenteId", "ocorridoEm");

-- CreateIndex
CREATE INDEX "anotacoes_saude_retificaAnotacaoSaudeId_idx" ON "anotacoes_saude"("retificaAnotacaoSaudeId");

-- CreateIndex
CREATE INDEX "sinais_vitais_residenteId_aferidoEm_idx" ON "sinais_vitais"("residenteId", "aferidoEm");

-- CreateIndex
CREATE INDEX "exames_status_dataSolicitacao_idx" ON "exames"("status", "dataSolicitacao");

-- CreateIndex
CREATE INDEX "exames_residenteId_dataSolicitacao_idx" ON "exames"("residenteId", "dataSolicitacao");

-- CreateIndex
CREATE INDEX "consultas_status_dataHora_idx" ON "consultas"("status", "dataHora");

-- CreateIndex
CREATE INDEX "consultas_residenteId_dataHora_idx" ON "consultas"("residenteId", "dataHora");

-- CreateIndex
CREATE INDEX "vacinas_residenteId_dataAplicacao_idx" ON "vacinas"("residenteId", "dataAplicacao");

-- AddForeignKey
ALTER TABLE "condicoes_cronicas" ADD CONSTRAINT "condicoes_cronicas_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "residentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alergias" ADD CONSTRAINT "alergias_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "residentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restricoes_alimentares" ADD CONSTRAINT "restricoes_alimentares_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "residentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anotacoes_saude" ADD CONSTRAINT "anotacoes_saude_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "residentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sinais_vitais" ADD CONSTRAINT "sinais_vitais_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "residentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exames" ADD CONSTRAINT "exames_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "residentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exames" ADD CONSTRAINT "exames_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultas" ADD CONSTRAINT "consultas_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "residentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultas" ADD CONSTRAINT "consultas_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacinas" ADD CONSTRAINT "vacinas_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "residentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


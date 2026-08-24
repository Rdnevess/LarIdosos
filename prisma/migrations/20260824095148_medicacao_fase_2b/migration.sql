-- Fase 2B — medicação: o esquema medicamentoso e o registro dose a dose.
--
-- A restrição única (medicacaoId, horarioPrevisto) é a regra R4 em forma de
-- constraint: impede que duas pessoas com a tela do turno aberta marquem a
-- mesma dose duas vezes. `horarioPrevisto` é a INSTÂNCIA da dose, não o
-- horário do esquema — com `HH:mm` a restrição permitiria uma administração
-- por medicação para sempre.
--
-- Nulo para SE_NECESSARIO, e o Postgres trata nulos como distintos numa
-- restrição única: é o que permite registrar "se necessário" quantas vezes for.
--
-- Gerada por `prisma migrate diff`, não por `migrate dev`: os comentários da
-- migration `20260820213908_documento_funcionario_fk` foram editados depois de
-- aplicada, e `migrate dev` pede reset do banco de desenvolvimento.

-- CreateEnum
CREATE TYPE "ViaMedicacao" AS ENUM ('ORAL', 'SUBLINGUAL', 'IM', 'EV', 'SC', 'TOPICA', 'INALATORIA', 'OFTALMICA', 'OTOLOGICA', 'RETAL');

-- CreateEnum
CREATE TYPE "TipoMedicacao" AS ENUM ('HORARIO_FIXO', 'SE_NECESSARIO');

-- CreateEnum
CREATE TYPE "StatusAdministracao" AS ENUM ('ADMINISTRADA', 'RECUSADA', 'NAO_ADMINISTRADA');

-- CreateEnum
CREATE TYPE "MotivoNaoAdministracao" AS ENUM ('IDOSO_HOSPITALIZADO', 'IDOSO_AUSENTE', 'MEDICAMENTO_EM_FALTA', 'SUSPENSA_MEDICO', 'RECUSA_IDOSO', 'OUTRO');

-- CreateTable
CREATE TABLE "medicacoes" (
    "id" TEXT NOT NULL,
    "residenteId" TEXT NOT NULL,
    "farmaco" TEXT NOT NULL,
    "concentracao" TEXT,
    "formaFarmaceutica" TEXT,
    "dose" TEXT NOT NULL,
    "via" "ViaMedicacao" NOT NULL,
    "tipo" "TipoMedicacao" NOT NULL,
    "horarios" TEXT[],
    "diasSemana" INTEGER[],
    "instrucoes" TEXT,
    "prescritorNome" TEXT,
    "prescritorConselho" TEXT,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3),
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "motivoSuspensao" TEXT,
    "substituiMedicacaoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "medicacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administracoes_medicacao" (
    "id" TEXT NOT NULL,
    "medicacaoId" TEXT NOT NULL,
    "residenteId" TEXT NOT NULL,
    "horarioPrevisto" TIMESTAMP(3),
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StatusAdministracao" NOT NULL,
    "motivo" "MotivoNaoAdministracao",
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" TEXT,

    CONSTRAINT "administracoes_medicacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medicacoes_residenteId_ativa_idx" ON "medicacoes"("residenteId", "ativa");

-- CreateIndex
CREATE INDEX "medicacoes_substituiMedicacaoId_idx" ON "medicacoes"("substituiMedicacaoId");

-- CreateIndex
CREATE INDEX "administracoes_medicacao_residenteId_horarioPrevisto_idx" ON "administracoes_medicacao"("residenteId", "horarioPrevisto");

-- CreateIndex
CREATE INDEX "administracoes_medicacao_horarioPrevisto_idx" ON "administracoes_medicacao"("horarioPrevisto");

-- CreateIndex
CREATE UNIQUE INDEX "administracoes_medicacao_medicacaoId_horarioPrevisto_key" ON "administracoes_medicacao"("medicacaoId", "horarioPrevisto");

-- AddForeignKey
ALTER TABLE "medicacoes" ADD CONSTRAINT "medicacoes_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "residentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administracoes_medicacao" ADD CONSTRAINT "administracoes_medicacao_medicacaoId_fkey" FOREIGN KEY ("medicacaoId") REFERENCES "medicacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administracoes_medicacao" ADD CONSTRAINT "administracoes_medicacao_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "residentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "GrauDependencia" AS ENUM ('I', 'II', 'III');

-- CreateTable
CREATE TABLE "avaliacoes_dependencia" (
    "id" TEXT NOT NULL,
    "residenteId" TEXT NOT NULL,
    "grau" "GrauDependencia" NOT NULL,
    "dataAvaliacao" DATE NOT NULL,
    "avaliadorNome" TEXT NOT NULL,
    "avaliadorId" TEXT,
    "justificativa" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" TEXT,

    CONSTRAINT "avaliacoes_dependencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avaliacoes_dependencia_residenteId_dataAvaliacao_idx" ON "avaliacoes_dependencia"("residenteId", "dataAvaliacao");

-- AddForeignKey
ALTER TABLE "avaliacoes_dependencia" ADD CONSTRAINT "avaliacoes_dependencia_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "residentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

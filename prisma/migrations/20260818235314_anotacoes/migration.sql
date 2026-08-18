-- CreateEnum
CREATE TYPE "CategoriaAnotacao" AS ENUM ('COMPORTAMENTO', 'VISITA_FAMILIA', 'OCORRENCIA', 'SOCIAL', 'JURIDICO', 'OUTRO');

-- CreateTable
CREATE TABLE "anotacoes" (
    "id" TEXT NOT NULL,
    "residenteId" TEXT NOT NULL,
    "categoria" "CategoriaAnotacao" NOT NULL,
    "texto" TEXT NOT NULL,
    "editavelAte" TIMESTAMP(3) NOT NULL,
    "retificaAnotacaoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT NOT NULL,

    CONSTRAINT "anotacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "anotacoes_residenteId_criadoEm_idx" ON "anotacoes"("residenteId", "criadoEm");

-- AddForeignKey
ALTER TABLE "anotacoes" ADD CONSTRAINT "anotacoes_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "residentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anotacoes" ADD CONSTRAINT "anotacoes_retificaAnotacaoId_fkey" FOREIGN KEY ("retificaAnotacaoId") REFERENCES "anotacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

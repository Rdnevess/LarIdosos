-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('RG', 'CPF', 'CNS', 'CERTIDAO', 'LAUDO', 'PROCURACAO', 'TERMO_RESPONSABILIDADE', 'TERMO_LGPD', 'FOTO', 'EXAME', 'COMPROVANTE_FISCAL', 'CONSELHO_PROFISSIONAL', 'OUTRO');

-- CreateTable
CREATE TABLE "documentos" (
    "id" TEXT NOT NULL,
    "tipo" "TipoDocumento" NOT NULL,
    "descricao" TEXT,
    "nomeArquivoOriginal" TEXT NOT NULL,
    "caminhoArmazenamento" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "residenteId" TEXT,
    "funcionarioId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" TEXT,

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documentos_residenteId_ativo_idx" ON "documentos"("residenteId", "ativo");

-- CreateIndex
CREATE INDEX "documentos_funcionarioId_ativo_idx" ON "documentos"("funcionarioId", "ativo");

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "residentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoDocumento" ADD VALUE 'COMPROVANTE_PAGAMENTO';
ALTER TYPE "TipoDocumento" ADD VALUE 'EXTRATO_BANCARIO';

-- DropForeignKey
ALTER TABLE "lancamentos" DROP CONSTRAINT "lancamentos_documentoId_fkey";

-- AlterTable
-- RENAME, e nao DROP + ADD que o Prisma gerou: nenhuma tela jamais preencheu
-- "documentoId", entao hoje nao ha dado a perder, mas RENAME e o que continua
-- correto no dia em que houver, pelo custo de uma linha.
ALTER TABLE "lancamentos" RENAME COLUMN "documentoId" TO "documentoFiscalId";
ALTER TABLE "lancamentos" ADD COLUMN "comprovantePagamentoId" TEXT;

-- AlterTable
ALTER TABLE "prestacoes_contas" ADD COLUMN "extratoId" TEXT;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_documentoFiscalId_fkey" FOREIGN KEY ("documentoFiscalId") REFERENCES "documentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_comprovantePagamentoId_fkey" FOREIGN KEY ("comprovantePagamentoId") REFERENCES "documentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestacoes_contas" ADD CONSTRAINT "prestacoes_contas_extratoId_fkey" FOREIGN KEY ("extratoId") REFERENCES "documentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

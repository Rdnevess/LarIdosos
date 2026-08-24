-- Fase 3 — financeiro e prestação de contas.
--
-- A restrição única (contaBancariaId, anoCompetencia, mesCompetencia) impede
-- duas prestações concorrentes do mesmo período, cada uma com um saldo
-- diferente. A conta é o eixo do módulo: cada lançamento pertence a uma, e
-- cada prestação cobre uma conta num mês.
--
-- Valores monetários são Decimal(12,2), nunca Float: dinheiro em ponto
-- flutuante é erro que aparece só na soma do fim do mês.
--
-- Gerada por `prisma migrate diff`, e não por `migrate dev`: os comentários da
-- migration `20260820213908_documento_funcionario_fk` foram editados depois de
-- aplicada, e `migrate dev` pede reset do banco de desenvolvimento.

-- CreateEnum
CREATE TYPE "TipoConta" AS ENUM ('CORRENTE', 'POUPANCA', 'APLICACAO');

-- CreateEnum
CREATE TYPE "NaturezaLancamento" AS ENUM ('RECEITA', 'DESPESA');

-- CreateEnum
CREATE TYPE "StatusLancamento" AS ENUM ('PREVISTO', 'REALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('PIX', 'TED', 'CHEQUE', 'DEBITO', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoDocumentoFornecedor" AS ENUM ('CNPJ', 'CPF');

-- CreateEnum
CREATE TYPE "StatusPrestacao" AS ENUM ('ABERTA', 'FECHADA');

-- CreateTable
CREATE TABLE "configuracao_instituicao" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "enderecoCompleto" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "orgaoDestinatario" TEXT NOT NULL,
    "nomePresidente" TEXT NOT NULL,
    "nomeTesoureiro" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "configuracao_instituicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_bancarias" (
    "id" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "agencia" TEXT NOT NULL,
    "numeroConta" TEXT NOT NULL,
    "tipo" "TipoConta" NOT NULL,
    "titular" TEXT NOT NULL,
    "saldoInicial" DECIMAL(12,2) NOT NULL,
    "dataSaldoInicial" DATE NOT NULL,
    "prestaContas" BOOLEAN NOT NULL DEFAULT true,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "contas_bancarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "origens_receita" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "rotuloPrestacao" TEXT NOT NULL,
    "exigeResidente" BOOLEAN NOT NULL DEFAULT false,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "origens_receita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_despesa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "categorias_despesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fornecedores" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "tipoDocumento" "TipoDocumentoFornecedor" NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamentos" (
    "id" TEXT NOT NULL,
    "natureza" "NaturezaLancamento" NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "data" DATE NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "status" "StatusLancamento" NOT NULL DEFAULT 'REALIZADO',
    "prestacaoContasId" TEXT,
    "documentoId" TEXT,
    "motivoCancelamento" TEXT,
    "observacao" TEXT,
    "conciliado" BOOLEAN NOT NULL DEFAULT false,
    "conciliadoEm" TIMESTAMP(3),
    "origemReceitaId" TEXT,
    "residenteId" TEXT,
    "pagadorNome" TEXT,
    "pagadorDocumento" TEXT,
    "fornecedorId" TEXT,
    "categoriaDespesaId" TEXT,
    "formaPagamento" "FormaPagamento",
    "numeroDocumentoFiscal" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "lancamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prestacoes_contas" (
    "id" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "mesCompetencia" INTEGER NOT NULL,
    "anoCompetencia" INTEGER NOT NULL,
    "saldoAnterior" DECIMAL(12,2) NOT NULL,
    "saldoAnteriorAjustado" DECIMAL(12,2),
    "justificativaAjuste" TEXT,
    "observacoes" TEXT NOT NULL DEFAULT '',
    "status" "StatusPrestacao" NOT NULL DEFAULT 'ABERTA',
    "fechadaEm" TIMESTAMP(3),
    "fechadaPorId" TEXT,
    "reabertaEm" TIMESTAMP(3),
    "reabertaPorId" TEXT,
    "motivoReabertura" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "prestacoes_contas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contribuicoes_residente" (
    "id" TEXT NOT NULL,
    "residenteId" TEXT NOT NULL,
    "percentual" DECIMAL(5,2) NOT NULL,
    "valorBaseBeneficio" DECIMAL(12,2) NOT NULL,
    "vigenciaInicio" DATE NOT NULL,
    "vigenciaFim" DATE,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "contribuicoes_residente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contas_bancarias_ativa_idx" ON "contas_bancarias"("ativa");

-- CreateIndex
CREATE INDEX "origens_receita_ativa_idx" ON "origens_receita"("ativa");

-- CreateIndex
CREATE INDEX "categorias_despesa_ativa_idx" ON "categorias_despesa"("ativa");

-- CreateIndex
CREATE INDEX "fornecedores_ativo_idx" ON "fornecedores"("ativo");

-- CreateIndex
CREATE INDEX "lancamentos_contaBancariaId_data_idx" ON "lancamentos"("contaBancariaId", "data");

-- CreateIndex
CREATE INDEX "lancamentos_prestacaoContasId_idx" ON "lancamentos"("prestacaoContasId");

-- CreateIndex
CREATE INDEX "lancamentos_residenteId_data_idx" ON "lancamentos"("residenteId", "data");

-- CreateIndex
CREATE INDEX "prestacoes_contas_anoCompetencia_mesCompetencia_idx" ON "prestacoes_contas"("anoCompetencia", "mesCompetencia");

-- CreateIndex
CREATE UNIQUE INDEX "prestacoes_contas_contaBancariaId_anoCompetencia_mesCompete_key" ON "prestacoes_contas"("contaBancariaId", "anoCompetencia", "mesCompetencia");

-- CreateIndex
CREATE INDEX "contribuicoes_residente_residenteId_vigenciaInicio_idx" ON "contribuicoes_residente"("residenteId", "vigenciaInicio");

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_prestacaoContasId_fkey" FOREIGN KEY ("prestacaoContasId") REFERENCES "prestacoes_contas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_origemReceitaId_fkey" FOREIGN KEY ("origemReceitaId") REFERENCES "origens_receita"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "residentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_categoriaDespesaId_fkey" FOREIGN KEY ("categoriaDespesaId") REFERENCES "categorias_despesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestacoes_contas" ADD CONSTRAINT "prestacoes_contas_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribuicoes_residente" ADD CONSTRAINT "contribuicoes_residente_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "residentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


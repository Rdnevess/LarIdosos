-- CreateEnum
CREATE TYPE "Sexo" AS ENUM ('FEMININO', 'MASCULINO', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusResidente" AS ENUM ('ATIVO', 'DESLIGADO', 'FALECIDO');

-- CreateEnum
CREATE TYPE "TipoBeneficio" AS ENUM ('APOSENTADORIA', 'BPC', 'PENSAO', 'NENHUM');

-- CreateTable
CREATE TABLE "residentes" (
    "id" TEXT NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "nomeSocial" TEXT,
    "dataNascimento" DATE NOT NULL,
    "sexo" "Sexo" NOT NULL,
    "estadoCivil" TEXT,
    "naturalidade" TEXT,
    "nacionalidade" TEXT NOT NULL DEFAULT 'Brasileira',
    "religiao" TEXT,
    "escolaridade" TEXT,
    "cpf" TEXT,
    "rg" TEXT,
    "orgaoEmissorRg" TEXT,
    "cns" TEXT,
    "dataAdmissao" DATE NOT NULL,
    "origemAdmissao" TEXT,
    "motivoAdmissao" TEXT,
    "quarto" TEXT,
    "leito" TEXT,
    "planoSaude" TEXT,
    "numeroPlanoSaude" TEXT,
    "beneficioTipo" "TipoBeneficio",
    "beneficioNumero" TEXT,
    "beneficioValor" DECIMAL(12,2),
    "status" "StatusResidente" NOT NULL DEFAULT 'ATIVO',
    "dataSaida" DATE,
    "motivoSaida" TEXT,
    "observacaoSaida" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "residentes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "residentes_cpf_key" ON "residentes"("cpf");

-- CreateIndex
CREATE INDEX "residentes_status_nomeCompleto_idx" ON "residentes"("status", "nomeCompleto");

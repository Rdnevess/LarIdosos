-- CreateEnum
CREATE TYPE "VinculoFuncionario" AS ENUM ('CLT', 'VOLUNTARIO', 'PRESTADOR', 'ESTAGIO');

-- CreateTable
CREATE TABLE "funcionarios" (
    "id" TEXT NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "rg" TEXT,
    "cargo" TEXT NOT NULL,
    "vinculo" "VinculoFuncionario" NOT NULL,
    "dataAdmissao" DATE NOT NULL,
    "dataDesligamento" DATE,
    "motivoDesligamento" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" CHAR(2),
    "cep" TEXT,
    "conselhoSigla" TEXT,
    "conselhoNumero" TEXT,
    "conselhoUf" CHAR(2),
    "conselhoValidade" DATE,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "funcionarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "funcionarios_cpf_key" ON "funcionarios"("cpf");

-- CreateIndex
CREATE INDEX "funcionarios_ativo_nomeCompleto_idx" ON "funcionarios"("ativo", "nomeCompleto");

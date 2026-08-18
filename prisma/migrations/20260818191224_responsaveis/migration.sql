-- CreateTable
CREATE TABLE "responsaveis" (
    "id" TEXT NOT NULL,
    "residenteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "parentesco" TEXT NOT NULL,
    "cpf" TEXT,
    "telefonePrincipal" TEXT NOT NULL,
    "telefoneSecundario" TEXT,
    "email" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" CHAR(2),
    "cep" TEXT,
    "ehResponsavelLegal" BOOLEAN NOT NULL DEFAULT false,
    "ehContatoEmergencia" BOOLEAN NOT NULL DEFAULT false,
    "autorizadoVisitar" BOOLEAN NOT NULL DEFAULT true,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT,

    CONSTRAINT "responsaveis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "responsaveis_residenteId_ativo_idx" ON "responsaveis"("residenteId", "ativo");

-- AddForeignKey
ALTER TABLE "responsaveis" ADD CONSTRAINT "responsaveis_residenteId_fkey" FOREIGN KEY ("residenteId") REFERENCES "residentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Alerta de sinal vital fora de faixa.
--
-- Duas tabelas e nenhuma de alertas: o alerta e derivado na leitura, como as
-- doses previstas. Materializa-lo exigiria cron e, pior, sobreviveria ao ajuste
-- da faixa -- um alerta gravado sob a faixa antiga continuaria existindo depois
-- de alguem corrigi-la, e alguem teria de sair apagando o que a faixa nova nao
-- produz.
CREATE TYPE "MedidaVital" AS ENUM (
  'PRESSAO_SISTOLICA', 'PRESSAO_DIASTOLICA', 'FREQUENCIA_CARDIACA',
  'FREQUENCIA_RESPIRATORIA', 'TEMPERATURA', 'SATURACAO_O2', 'GLICEMIA'
);

CREATE TABLE "faixas_referencia" (
  "id"           TEXT NOT NULL,
  "residenteId"  TEXT NOT NULL,
  "medida"       "MedidaVital" NOT NULL,
  "minimo"       DECIMAL(5,1),
  "maximo"       DECIMAL(5,1),
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  "criadoPorId"  TEXT,
  CONSTRAINT "faixas_referencia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "faixas_referencia_residenteId_medida_key"
  ON "faixas_referencia"("residenteId", "medida");

ALTER TABLE "faixas_referencia"
  ADD CONSTRAINT "faixas_referencia_residenteId_fkey"
  FOREIGN KEY ("residenteId") REFERENCES "residentes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "alertas_dispensados" (
  "id"           TEXT NOT NULL,
  "usuarioId"    TEXT NOT NULL,
  "sinalVitalId" TEXT NOT NULL,
  "medida"       "MedidaVital" NOT NULL,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alertas_dispensados_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "alertas_dispensados_usuarioId_sinalVitalId_medida_key"
  ON "alertas_dispensados"("usuarioId", "sinalVitalId", "medida");

CREATE INDEX "alertas_dispensados_usuarioId_idx"
  ON "alertas_dispensados"("usuarioId");

ALTER TABLE "alertas_dispensados"
  ADD CONSTRAINT "alertas_dispensados_sinalVitalId_fkey"
  FOREIGN KEY ("sinalVitalId") REFERENCES "sinais_vitais"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

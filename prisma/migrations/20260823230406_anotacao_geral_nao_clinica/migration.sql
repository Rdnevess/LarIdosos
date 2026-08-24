-- A anotação geral passa a ser estritamente não-clínica.
--
-- COMPORTAMENTO e OCORRENCIA saem daqui e passam a existir só em
-- `CategoriaAnotacaoSaude`, como COMPORTAMENTO e INTERCORRENCIA. Sem isso o
-- mesmo evento poderia ser registrado nos dois lugares, e o prontuário
-- ficaria com metade da história.
--
-- O valor antigo vai para o início do texto: em ambiente que já tenha dado
-- real, a informação não pode sumir só porque a categoria mudou de lugar.
UPDATE "anotacoes"
   SET "texto" = '[ocorrência] ' || "texto", "categoria" = 'OUTRO'
 WHERE "categoria" = 'OCORRENCIA';

UPDATE "anotacoes"
   SET "texto" = '[comportamento] ' || "texto", "categoria" = 'OUTRO'
 WHERE "categoria" = 'COMPORTAMENTO';

-- Postgres não remove valor de enum com ALTER TYPE: o tipo é recriado.
ALTER TYPE "CategoriaAnotacao" RENAME TO "CategoriaAnotacao_antigo";
CREATE TYPE "CategoriaAnotacao" AS ENUM ('VISITA_FAMILIA', 'SOCIAL', 'JURIDICO', 'OUTRO');
ALTER TABLE "anotacoes"
  ALTER COLUMN "categoria" TYPE "CategoriaAnotacao"
  USING ("categoria"::text::"CategoriaAnotacao");
DROP TYPE "CategoriaAnotacao_antigo";

-- Busca que não depende de acento.
--
-- `mode: 'insensitive'` do Prisma resolve maiúscula/minúscula e não toca em
-- acento: "jose" não achava "José". Quem usa o sistema digita no celular, em pé
-- no corredor, e o nome do residente é o campo mais buscado que existe aqui.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- `unaccent` é declarada STABLE, e não IMMUTABLE, porque depende do dicionário
-- instalado — que em tese pode mudar. Coluna gerada exige IMMUTABLE, então o
-- invólucro afirma o que na prática vale: o dicionário desta instalação não
-- muda. É o remendo que a própria documentação do Postgres descreve. Fixar o
-- dicionário por nome (em vez de deixar o Postgres resolvê-lo pelo search_path)
-- é o que torna a afirmação honesta.
CREATE OR REPLACE FUNCTION f_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- Gerada pelo banco, e não mantida pela aplicação, de propósito: assim nenhum
-- caminho de escrita precisa lembrar de atualizá-la, e um serviço novo não tem
-- como esquecer. Os campos vão concatenados numa coluna só, o que troca o `OR`
-- de duas condições por uma.
ALTER TABLE "residentes"
  ADD COLUMN "busca" text
  GENERATED ALWAYS AS (
    f_unaccent(lower(coalesce("nomeCompleto", '') || ' ' || coalesce("nomeSocial", '')))
  ) STORED;

ALTER TABLE "funcionarios"
  ADD COLUMN "busca" text
  GENERATED ALWAYS AS (
    f_unaccent(lower(coalesce("nomeCompleto", '') || ' ' || coalesce("cargo", '')))
  ) STORED;

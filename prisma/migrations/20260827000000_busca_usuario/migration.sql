-- Busca de usuário que não depende de acento, na mesma família da de
-- `residentes` e `funcionarios` (migration `20260825120000_busca_sem_acento`).
--
-- A tela de usuários ganhou filtro por nome, e `mode: 'insensitive'` do Prisma
-- resolveria maiúscula/minúscula sem tocar em acento — "conceicao" não acharia
-- "Conceição". São poucas contas, mas duas respostas diferentes para "como se
-- procura um nome neste sistema" é uma a mais do que cabe.
--
-- `f_unaccent` já existe desde aquela migration; aqui só se acrescenta a coluna.
ALTER TABLE "usuarios"
  ADD COLUMN "busca" text
  GENERATED ALWAYS AS (
    f_unaccent(lower(coalesce("nome", '') || ' ' || coalesce("email", '')))
  ) STORED;

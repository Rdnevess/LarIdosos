-- CPF de funcionário deixa de ser único.
--
-- Recontratação é registro novo: a mesma pessoa pode voltar a trabalhar no Lar
-- depois de desligada, com admissão, cargo e desligamento próprios. Forçar
-- unicidade obrigaria a reabrir a ficha antiga e sobrescrever o vínculo
-- anterior — apagando justamente a história que a ficha existe para guardar.
--
-- Residente continua único: lá o cadastro é da pessoa, e a mesma pessoa não
-- ocupa dois cadastros.
DROP INDEX "funcionarios_cpf_key";

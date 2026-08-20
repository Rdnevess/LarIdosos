-- `funcionarioId` existia sem chave estrangeira: `anexarDocumento` conferia
-- `residenteId` antes de gravar bytes no disco e não conferia o funcionário,
-- então um id inexistente entrava no banco sem nenhum erro.
--
-- Linhas órfãs impediriam a criação da restrição. Aqui elas são apagadas: um
-- documento cujo funcionário não existe não é recuperável — não há a quem
-- vinculá-lo, e ele não aparece em tela nenhuma, porque `listarDocumentos`
-- sempre consulta por um alvo existente. No banco de desenvolvimento em que
-- esta migration foi criada não havia nenhuma (13 documentos, 0 com
-- `funcionarioId` preenchido); o DELETE está aqui para os outros ambientes.
--
-- O arquivo em disco correspondente não é removido por este DELETE. Se a
-- contagem abaixo não for zero em produção, sobra lixo em `lar_uploads`
-- — inofensivo, mas vale saber.
--
-- Este DELETE não grava nada em `LogAuditoria`. É o único DELETE físico do
-- projeto (todo o resto do sistema só exclui logicamente, por `ativo`), e
-- roda fora de qualquer serviço — não há `Ctx` aqui, só a migration. Se
-- alguma linha for de fato apagada num ambiente em uso, isso acontece sem
-- rastro na trilha de auditoria.
DELETE FROM "documentos" d
WHERE d."funcionarioId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "funcionarios" f WHERE f.id = d."funcionarioId");

-- AddForeignKey
-- ON DELETE RESTRICT (e não o SET NULL padrão do Prisma para relação
-- opcional): zerar `funcionarioId` faria `papeisQuePodemVer` reclassificar o
-- documento — o laudo de um funcionário viraria documento clínico de
-- residente e ficaria visível ao papel SAUDE. A exclusão neste sistema é
-- sempre lógica, então nenhum DELETE físico deveria ocorrer; se ocorrer, é
-- melhor falhar do que mudar em silêncio quem pode ver o documento.
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "funcionarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

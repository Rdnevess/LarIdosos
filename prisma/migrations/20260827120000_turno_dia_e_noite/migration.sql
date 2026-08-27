-- Tres turnos de oito horas viram dois de doze: DIA 6h-18h, NOITE 18h-6h.
--
-- **As anotacoes ja gravadas sao recalculadas a partir de `ocorridoEm`, e nao
-- por troca de rotulo.** A diferenca importa: `AnotacaoSaude` guarda o instante
-- real do que aconteceu, entao a divisao nova pode ser aplicada ao horario de
-- verdade. Mapear "TARDE -> DIA" seria inventar — uma anotacao das 20h estava
-- gravada como TARDE pela regra antiga (14h-22h) e pertence a NOITE pela nova.
-- Sao registros de prontuario, que a fiscalizacao le; nenhum passa a afirmar o
-- que nao aconteceu.
--
-- ## Por que a conversao de fuso, e por que este fuso
--
-- A coluna e `timestamp without time zone` e o Prisma grava nela o **relogio
-- UTC**: um registro feito as 20h em Sao Paulo fica gravado como 23h. Foi
-- conferido gravando pelo proprio cliente e lendo a coluna crua, e nao
-- deduzido. Um `EXTRACT(HOUR FROM "ocorridoEm")` direto classificaria pelo
-- relogio de Greenwich — uma anotacao das 16h (19h UTC) viraria NOITE, e uma
-- das 4h da madrugada (7h UTC) viraria DIA. Exatamente ao contrario.
--
-- O fuso e `America/Sao_Paulo` porque e o que o `docker-compose.yml` declara
-- para o servico da aplicacao (`TZ: America/Sao_Paulo`), e e o relogio que a
-- equipe do Lar viveu. **O contentor do Postgres roda em UTC**, entao
-- `current_setting('TIMEZONE')` nao serviria aqui: daria UTC em producao.
-- O proprio compose ja registra esta armadilha no comentario do `TZ`.
--
-- A regra em SQL e uma segunda escrita da que vive em `src/lib/turno.ts`
-- (`turnoDaHora`). Ha teste conferindo que as duas concordam, inclusive nas
-- bordas e na travessia da meia-noite — duas copias da mesma regra divergem, e
-- esta decide o que a fiscalizacao le.
--
-- Postgres nao remove valor de enum, entao o caminho e um tipo novo com
-- conversao explicita na troca da coluna.
CREATE TYPE "Turno_novo" AS ENUM ('DIA', 'NOITE');

ALTER TABLE "anotacoes_saude"
  ALTER COLUMN "turno" TYPE "Turno_novo"
  USING (
    CASE
      WHEN EXTRACT(
             HOUR FROM ("ocorridoEm" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')
           ) BETWEEN 6 AND 17
      THEN 'DIA'
      ELSE 'NOITE'
    END
  )::"Turno_novo";

DROP TYPE "Turno";
ALTER TYPE "Turno_novo" RENAME TO "Turno";

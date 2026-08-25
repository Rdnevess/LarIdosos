/**
 * O termo de busca, na mesma forma em que a coluna `busca` guarda os nomes.
 *
 * A coluna é gerada pelo Postgres como `f_unaccent(lower(...))` — ver a
 * migration `20260825120000_busca_sem_acento`. Aqui se faz o mesmo do lado de
 * quem procura: **os dois lados precisam falar a mesma língua**, ou procurar
 * "José" não acharia o "jose" que a coluna guardou.
 *
 * A decomposição NFD separa a letra do sinal, e `\p{Diacritic}` apaga o sinal.
 * A propriedade Unicode diz o que se quer dizer, e cobre a cedilha — que não é
 * acento, mas se decompõe do mesmo jeito. Uma lista de vogais acentuadas
 * deixaria o `ç` de fora, e "Conceição" é nome comum demais para isso.
 */
export function normalizarBusca(termo: string): string {
  return termo
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

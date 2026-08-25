/**
 * Para onde mandar a pessoa depois do login.
 *
 * O middleware já escrevia `?proximo=` ao barrar uma navegação, e ninguém lia:
 * quem tentava abrir `/turno` sem sessão entrava e caía em `/residentes`, tendo
 * de navegar de novo até onde queria. Este módulo é o que faltava para fechar
 * esse caminho.
 *
 * **Todo valor vem da barra de endereço, então nada é confiável.** Um link
 * `/login?proximo=https://site-falso` levaria a pessoa para fora logo depois de
 * ela digitar a senha aqui — no momento exato em que ela acabou de provar que
 * confia nesta tela. É por isso que a recusa é por lista de permissão (só
 * caminho interno passa) e não por lista de bloqueio.
 */

export const DESTINO_PADRAO = '/residentes'

export function destinoSeguro(valor: string | undefined | null): string {
  const caminho = valor?.trim()
  if (!caminho) return DESTINO_PADRAO

  // Precisa começar com uma barra só. `//site-falso` e `/\site-falso` não
  // parecem externos, mas o navegador os lê como endereço absoluto — é o caso
  // que passa por uma checagem ingênua de "começa com barra". Barrar o segundo
  // caractere resolve os dois, e de quebra qualquer esquema (`javascript:`,
  // `data:`), que nunca começa com barra.
  if (!caminho.startsWith('/') || caminho.startsWith('//') || caminho.startsWith('/\\')) {
    return DESTINO_PADRAO
  }

  // Voltar para o login seria devolver a pessoa à tela de onde ela acabou de
  // sair.
  if (caminho === '/login' || caminho.startsWith('/login?')) return DESTINO_PADRAO

  return caminho
}

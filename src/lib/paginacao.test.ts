import { describe, it, expect } from 'vitest'
import {
  TAMANHOS,
  TAMANHO_PADRAO,
  numeroDaPagina,
  tamanhoDePagina,
  totalDePaginas,
  comParametros,
} from './paginacao'

describe('numeroDaPagina', () => {
  it('aceita um inteiro positivo', () => {
    expect(numeroDaPagina('2')).toBe(2)
    expect(numeroDaPagina('137')).toBe(137)
  })

  it('cai na primeira página diante de qualquer coisa que não seja isso', () => {
    // `?pagina=` é digitável à mão na barra de endereço, e `Number('abc')` é
    // `NaN`. Sem o resguardo, o `NaN` chegaria ao `skip` do Prisma e quebraria
    // a consulta em vez de simplesmente mostrar a primeira página.
    for (const entrada of [undefined, '', 'abc', '0', '-3', '2.5', 'NaN', 'Infinity']) {
      expect(numeroDaPagina(entrada), `entrada ${JSON.stringify(entrada)}`).toBe(1)
    }
  })
})

describe('tamanhoDePagina', () => {
  it('aceita os três tamanhos oferecidos', () => {
    expect(tamanhoDePagina('20')).toBe(20)
    expect(tamanhoDePagina('40')).toBe(40)
    expect(tamanhoDePagina('60')).toBe(60)
  })

  it('recusa qualquer outro e cai no padrão', () => {
    // A lista é fechada de propósito: `?por=100000` numa tela de residentes
    // traria o banco inteiro para a memória do servidor, e a URL é pública
    // para quem já entrou.
    for (const entrada of [undefined, '', '30', '19', '61', '0', '-20', 'abc', '20.0']) {
      expect(tamanhoDePagina(entrada), `entrada ${JSON.stringify(entrada)}`).toBe(TAMANHO_PADRAO)
    }
  })

  it('oferece exatamente os tamanhos que aceita', () => {
    // Sem isto, acrescentar um botão na tela e esquecer da guarda daria um
    // controle que sempre cai no padrão — e ninguém entenderia por quê.
    for (const tamanho of TAMANHOS) {
      expect(tamanhoDePagina(String(tamanho))).toBe(tamanho)
    }
  })
})

describe('totalDePaginas', () => {
  it('conta a última página incompleta', () => {
    expect(totalDePaginas(41, 20)).toBe(3)
    expect(totalDePaginas(40, 20)).toBe(2)
    expect(totalDePaginas(1, 20)).toBe(1)
  })

  it('lista vazia continua tendo uma página', () => {
    // Zero páginas faria a tela dizer "página 1 de 0". A lista vazia é a
    // resposta certa da primeira página, não a ausência de página.
    expect(totalDePaginas(0, 20)).toBe(1)
  })
})

describe('comParametros', () => {
  it('preserva os filtros que já estão na barra de endereço', () => {
    // Trocar de página não pode perder a busca: quem procurou "maria" e foi
    // para a página 2 espera a página 2 *de maria*, e não da lista inteira.
    expect(comParametros({ busca: 'maria', status: 'ATIVO' }, { pagina: 2 })).toBe(
      '?busca=maria&status=ATIVO&pagina=2'
    )
  })

  it('descarta filtro vazio, para não sujar a URL', () => {
    expect(comParametros({ busca: '', status: 'ATIVO' }, { pagina: 2 })).toBe(
      '?status=ATIVO&pagina=2'
    )
  })

  it('remove a chave quando a mudança é indefinida', () => {
    // É assim que o filtro novo derruba a página: quem muda a busca volta a
    // ver a primeira página, e não a terceira de um resultado que já não
    // existe.
    expect(comParametros({ busca: 'maria', pagina: '3' }, { pagina: undefined })).toBe(
      '?busca=maria'
    )
  })

  it('a mudança vence o valor que já estava lá', () => {
    expect(comParametros({ pagina: '3' }, { pagina: 1 })).toBe('?pagina=1')
  })

  it('sem nada, devolve string vazia e não um "?" solto', () => {
    expect(comParametros({}, {})).toBe('')
  })
})

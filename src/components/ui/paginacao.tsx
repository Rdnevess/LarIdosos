import Link from 'next/link'
import { TAMANHOS, type Tamanho } from '@/lib/paginacao'

/**
 * O rodapé das listas: quantos há, em que página se está, quantos por página e
 * como andar.
 *
 * **Tudo é link, e nenhum é botão de JavaScript.** O estado da paginação mora
 * na URL, como já morava na trilha de auditoria — assim a página é
 * compartilhável, sobrevive ao recarregar e funciona antes de qualquer script
 * carregar. Numa tela que se abre no corredor com sinal ruim, isso não é
 * detalhe.
 *
 * O tamanho é opcional: a trilha de auditoria pagina de 50 em 50 e não oferece
 * escolha, e passar `por` é o que faz o seletor aparecer.
 */
export function Paginacao({
  pagina,
  paginas,
  total,
  por,
  rotulo,
  url,
}: {
  pagina: number
  paginas: number
  total: number
  por?: Tamanho
  /** O que se está contando, no plural: "residentes", "usuários". */
  rotulo: string
  /** Monta a URL preservando os filtros que já estão na barra de endereço. */
  url: (mudancas: { pagina?: number; por?: Tamanho }) => string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-suporte text-apoio">
        {total} {rotulo} · página {pagina} de {paginas}
      </p>

      {por !== undefined && (
        <div className="flex items-center gap-2">
          <span className="text-suporte text-apoio">Por página:</span>
          {TAMANHOS.map((tamanho) => (
            <Link
              key={tamanho}
              // Trocar o tamanho volta para a primeira página. Manter a página
              // atual mostraria uma lista vazia sempre que o número de páginas
              // encolhesse — passar de 20 para 60 na página 3 de 3 é o caso
              // comum, e ele deixaria de existir.
              href={url({ pagina: 1, por: tamanho })}
              aria-current={tamanho === por ? 'true' : undefined}
              className={`min-h-11 inline-flex items-center rounded border px-3 py-2 text-suporte ${
                tamanho === por ? 'border-acao font-medium text-acao' : 'text-firme'
              }`}
            >
              {tamanho}
            </Link>
          ))}
        </div>
      )}

      {/* Some inteiro quando tudo cabe numa página: dois controles desligados
          ocupam espaço e não dizem nada. */}
      {paginas > 1 && (
        <div className="flex gap-2">
          {pagina > 1 && (
            <Link
              href={url({ pagina: pagina - 1 })}
              className="min-h-11 inline-flex items-center rounded border px-3 py-2 text-suporte text-firme"
            >
              Anterior
            </Link>
          )}
          {pagina < paginas && (
            <Link
              href={url({ pagina: pagina + 1 })}
              className="min-h-11 inline-flex items-center rounded border px-3 py-2 text-suporte text-firme"
            >
              Próxima
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

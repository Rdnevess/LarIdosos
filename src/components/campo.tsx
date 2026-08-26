export type PropsCampo = {
  nome: string
  rotulo: string
  // `datetime-local` entrou com o prontuário: anotação e sinal vital precisam
  // da hora, não só do dia — é o que permite registrar às 6h o que aconteceu
  // às 3h sem que a linha do tempo minta sobre a madrugada.
  tipo?: 'text' | 'date' | 'datetime-local' | 'number' | 'email' | 'checkbox' | 'password'
  obrigatorio?: boolean
  opcoes?: { valor: string; rotulo: string }[]
  valorInicial?: string
  marcadoInicial?: boolean
  /**
   * Prefixo do atributo `id` (e do `for` do rótulo). Necessário sempre que a
   * mesma página renderiza o mesmo formulário em laço — a lista de usuários
   * emite um campo `senha` por linha, e sem prefixo os três compartilhavam
   * `id="senha"`: clicar no rótulo do terceiro focava a caixa do primeiro,
   * porque o navegador associa o rótulo ao primeiro `id` igual do documento.
   * Não entra no `name`: é o `name` que a Server Action lê, e ele precisa
   * continuar sendo o nome do campo de domínio.
   */
  prefixoId?: string
}

export function Campo({
  nome,
  rotulo,
  tipo = 'text',
  obrigatorio,
  opcoes,
  valorInicial,
  marcadoInicial,
  prefixoId,
}: PropsCampo) {
  const id = prefixoId ? `${prefixoId}-${nome}` : nome
  // `text-base` (16px) é deliberado: em iOS, fonte menor faz o navegador dar
  // zoom automático ao focar o campo — atrapalha justamente quem está com o
  // celular na mão, em pé no corredor.
  const classe = 'w-full rounded border border-borda px-3 py-2 text-base'

  // A caixa de seleção não usa o mesmo layout dos demais: rótulo à direita,
  // alvo de toque grande o bastante para o dedo (`h-5 w-5`), sem `w-full`.
  //
  // O piso de 44px do `globals.css` exclui checkbox de propósito — esticar a
  // caixinha a deformaria. `min-h-11` aqui devolve o alvo de toque ao
  // `<label>` que a envolve, com o mesmo `2.75rem` da regra base.
  if (tipo === 'checkbox') {
    return (
      <label htmlFor={id} className="flex min-h-11 items-center gap-2 py-2">
        <input
          id={id}
          name={nome}
          type="checkbox"
          defaultChecked={marcadoInicial}
          className="h-5 w-5 rounded border-borda"
        />
        <span className="text-sm font-medium text-firme">{rotulo}</span>
      </label>
    )
  }

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium text-firme">
        {rotulo}
        {obrigatorio && <span className="text-perigo"> *</span>}
      </label>
      {opcoes ? (
        <select id={id} name={nome} required={obrigatorio} defaultValue={valorInicial} className={classe}>
          <option value="">Selecione…</option>
          {opcoes.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={nome}
          type={tipo}
          required={obrigatorio}
          defaultValue={valorInicial}
          className={classe}
        />
      )}
    </div>
  )
}

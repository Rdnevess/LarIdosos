export type PropsCampo = {
  nome: string
  rotulo: string
  tipo?: 'text' | 'date' | 'number' | 'email' | 'checkbox'
  obrigatorio?: boolean
  opcoes?: { valor: string; rotulo: string }[]
  valorInicial?: string
  marcadoInicial?: boolean
}

export function Campo({
  nome,
  rotulo,
  tipo = 'text',
  obrigatorio,
  opcoes,
  valorInicial,
  marcadoInicial,
}: PropsCampo) {
  // `text-base` (16px) é deliberado: em iOS, fonte menor faz o navegador dar
  // zoom automático ao focar o campo — atrapalha justamente quem está com o
  // celular na mão, em pé no corredor.
  const classe = 'w-full rounded border border-slate-300 px-3 py-2 text-base'

  // A caixa de seleção não usa o mesmo layout dos demais: rótulo à direita,
  // alvo de toque grande o bastante para o dedo (`h-5 w-5`), sem `w-full`.
  if (tipo === 'checkbox') {
    return (
      <label htmlFor={nome} className="flex items-center gap-2 py-2">
        <input
          id={nome}
          name={nome}
          type="checkbox"
          defaultChecked={marcadoInicial}
          className="h-5 w-5 rounded border-slate-300"
        />
        <span className="text-sm font-medium text-slate-700">{rotulo}</span>
      </label>
    )
  }

  return (
    <div className="space-y-1">
      <label htmlFor={nome} className="text-sm font-medium text-slate-700">
        {rotulo}
        {obrigatorio && <span className="text-red-600"> *</span>}
      </label>
      {opcoes ? (
        <select id={nome} name={nome} required={obrigatorio} defaultValue={valorInicial} className={classe}>
          <option value="">Selecione…</option>
          {opcoes.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={nome}
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

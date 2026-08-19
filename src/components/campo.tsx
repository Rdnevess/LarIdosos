export type PropsCampo = {
  nome: string
  rotulo: string
  tipo?: 'text' | 'date' | 'number' | 'email'
  obrigatorio?: boolean
  opcoes?: { valor: string; rotulo: string }[]
  valorInicial?: string
}

export function Campo({
  nome,
  rotulo,
  tipo = 'text',
  obrigatorio,
  opcoes,
  valorInicial,
}: PropsCampo) {
  // `text-base` (16px) é deliberado: em iOS, fonte menor faz o navegador dar
  // zoom automático ao focar o campo — atrapalha justamente quem está com o
  // celular na mão, em pé no corredor.
  const classe = 'w-full rounded border border-slate-300 px-3 py-2 text-base'

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

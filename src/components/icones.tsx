/**
 * Os ícones do sistema, copiados à mão do Lucide (https://lucide.dev).
 *
 * Copyright (c) 2022 Lucide Contributors — licença ISC.
 *
 * **Copiados em vez de instalados**, num projeto que já é cuidadoso com cadeia
 * de suprimento: sem dependência nova, sem pergunta sobre o que ela arrasta
 * junto, sem pergunta de bundle — o que está aqui é o que vai para o navegador
 * —, e auditável, porque são caminhos SVG legíveis num arquivo.
 *
 * **Ícone nunca vai sozinho.** Ou acompanha rótulo em texto, ou recebe
 * `rotulo`, que vira `aria-label`. Ícone sem nome acessível é decoração que a
 * equipe de plantão precisa adivinhar — e adivinhar num plantão é o que este
 * sistema existe para evitar.
 *
 * `CAMINHOS` guarda o markup interno do SVG (os elementos filhos), não um
 * único `d`: vários ícones do Lucide são compostos por mais de um elemento —
 * dois `<path>`, ou `<circle>` mais `<path>` — e um `d` isolado não os
 * representa.
 */

export const CAMINHOS = {
  residente: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  prontuario:
    '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
  medicacao:
    '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  turno: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  financeiro:
    '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  auditoria:
    '<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
  funcionario:
    '<path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/>',
  documento:
    '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  alerta:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  sucesso: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  erro: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  busca: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  voltar: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  sair: '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
  tema: '<path d="M12 2v2"/><path d="M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715"/><path d="M16 12a4 4 0 0 0-4-4"/><path d="m19 5-1.256 1.256"/><path d="M20 12h2"/>',
} as const

export type NomeIcone = keyof typeof CAMINHOS

export function Icone({
  nome,
  rotulo,
  className = 'size-5',
}: {
  nome: NomeIcone
  rotulo?: string
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      // Sem rótulo, o ícone é decoração e sai da árvore de acessibilidade — o
      // texto ao lado já diz o que ele significa.
      role={rotulo ? 'img' : undefined}
      aria-label={rotulo}
      aria-hidden={rotulo ? undefined : true}
      // Seguro aqui: `CAMINHOS` é conteúdo vendorizado do Lucide, estático,
      // escrito neste arquivo — nunca vem de entrada de pessoa usuária nem de
      // requisição de rede. O teste "nenhum icone carrega script" barra o caso
      // em que alguém colaria markup externo aqui sem revisar.
      dangerouslySetInnerHTML={{ __html: CAMINHOS[nome] }}
    />
  )
}

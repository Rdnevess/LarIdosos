/**
 * O que é lixo de teste no banco de **desenvolvimento**, e o que é gente.
 *
 * A suíte E2E roda contra o banco de desenvolvimento, e não contra um banco
 * efêmero por execução — é o que permite abrir a tela e ver o estado que o
 * teste montou. O preço é que cada rodada deixa cadastros novos para trás, e
 * nada os recolhe.
 *
 * **Não é só ruído visual.** Com mil residentes acumulados e vinte por página,
 * um teste que cadastra alguém e o procura na lista deixa de encontrá-lo — foi
 * exatamente assim que a paginação derrubou seis testes de ponta a ponta que
 * estavam corretos. O entulho passa a produzir falha, e pior, passa a produzir
 * *aprovação* falsa: um `toHaveCount(0)` que deveria provar ausência do
 * registro passa a provar apenas ausência da página.
 *
 * Estes padrões moram aqui, e não dentro do script, para que possam ser
 * testados. Eles decidem o que se apaga, e erram em duas direções das quais só
 * uma é tolerável: deixar lixo custa ruído, apagar um cadastro de verdade custa
 * o cadastro.
 */

/**
 * `auditoria.1787598307085@lar.local` e afins.
 *
 * Minúsculas de propósito: os testes geram o e-mail em caixa baixa, e aceitar
 * qualquer caixa alargaria o alvo sem necessidade.
 */
export const EMAIL_DESCARTAVEL = /^[a-z]+\.\d{10,}@lar\.local$/

/**
 * `Ana Teste 1787654808734`: nome terminado no `Date.now()` que os testes
 * carimbam para não colidir entre execuções.
 *
 * A âncora no fim é o que torna o padrão seguro. Sem ela, um nome que apenas
 * *contivesse* um número longo entraria na conta — e o carimbo dos testes está
 * sempre no fim, nunca no meio.
 */
export const NOME_DESCARTAVEL = /\s\d{10,}$/

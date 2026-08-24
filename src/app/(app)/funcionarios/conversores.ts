import { texto, data, semIndefinidos } from '@/lib/formulario'

/**
 * `FormData` → dados de funcionário.
 *
 * Fica fora de `acoes.ts` porque aquele arquivo é `'use server'` e só pode
 * exportar funções assíncronas — o que tornaria este conversor intestável.
 * Ver `conversores.test.ts` ao lado.
 *
 * O `semIndefinidos` no fim é o que impede a trilha de auditoria de registrar
 * mudanças que não aconteceram: some com a chave do campo que o formulário
 * nem ofereceu. Campo oferecido e deixado em branco é outra coisa — chega
 * aqui como `null`, e gravar `null` é como se limpa um campo pela tela. A
 * explicação inteira está em `src/lib/formulario.ts`, na própria função.
 */
export function dadosDoFuncionario(dados: FormData) {
  return semIndefinidos({
    nomeCompleto: texto(dados, 'nomeCompleto')!,
    cpf: texto(dados, 'cpf')!,
    rg: texto(dados, 'rg'),
    cargo: texto(dados, 'cargo')!,
    vinculo: texto(dados, 'vinculo') as 'CLT' | 'VOLUNTARIO' | 'PRESTADOR' | 'ESTAGIO',
    dataAdmissao: data(dados, 'dataAdmissao')!,
    telefone: texto(dados, 'telefone'),
    email: texto(dados, 'email'),
    conselhoSigla: texto(dados, 'conselhoSigla'),
    conselhoNumero: texto(dados, 'conselhoNumero'),
    conselhoUf: texto(dados, 'conselhoUf'),
    conselhoValidade: data(dados, 'conselhoValidade'),
  })
}

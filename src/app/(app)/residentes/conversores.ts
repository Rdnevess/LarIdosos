import { texto, data, numero, semIndefinidos } from '@/lib/formulario'

/**
 * `FormData` → dados de residente.
 *
 * Fica fora de `acoes.ts` porque aquele arquivo é `'use server'` e só pode
 * exportar funções assíncronas — o que tornaria este conversor intestável.
 * Ver `conversores.test.ts` ao lado.
 *
 * O `semIndefinidos` no fim é o que impede a trilha de auditoria de registrar
 * mudanças que não aconteceram. Ele também é o motivo de **não ser possível
 * limpar um campo opcional pela tela** — a explicação inteira está em
 * `src/lib/formulario.ts`, na própria função.
 */
export function dadosDoResidente(dados: FormData) {
  return semIndefinidos({
    nomeCompleto: texto(dados, 'nomeCompleto')!,
    nomeSocial: texto(dados, 'nomeSocial'),
    dataNascimento: data(dados, 'dataNascimento')!,
    sexo: texto(dados, 'sexo') as 'FEMININO' | 'MASCULINO' | 'OUTRO',
    estadoCivil: texto(dados, 'estadoCivil'),
    naturalidade: texto(dados, 'naturalidade'),
    nacionalidade: texto(dados, 'nacionalidade') ?? 'Brasileira',
    religiao: texto(dados, 'religiao'),
    escolaridade: texto(dados, 'escolaridade'),
    cpf: texto(dados, 'cpf'),
    rg: texto(dados, 'rg'),
    orgaoEmissorRg: texto(dados, 'orgaoEmissorRg'),
    cns: texto(dados, 'cns'),
    dataAdmissao: data(dados, 'dataAdmissao')!,
    origemAdmissao: texto(dados, 'origemAdmissao'),
    motivoAdmissao: texto(dados, 'motivoAdmissao'),
    quarto: texto(dados, 'quarto'),
    leito: texto(dados, 'leito'),
    planoSaude: texto(dados, 'planoSaude'),
    numeroPlanoSaude: texto(dados, 'numeroPlanoSaude'),
    beneficioTipo: texto(dados, 'beneficioTipo') as
      | 'APOSENTADORIA' | 'BPC' | 'PENSAO' | 'NENHUM' | undefined,
    beneficioNumero: texto(dados, 'beneficioNumero'),
    beneficioValor: numero(dados, 'beneficioValor'),
  })
}

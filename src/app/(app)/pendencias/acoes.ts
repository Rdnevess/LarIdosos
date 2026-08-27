'use server'

import { revalidatePath } from 'next/cache'
import { ErroValidacao } from '@/lib/erros'
import { obterCtx } from '@/modules/auth/sessao'
import { dispensarAlerta } from '@/modules/health/alertas-vitais'
import { MEDIDAS_VITAIS, type MedidaVital } from '@/modules/health/faixas'

/**
 * Dispensa um alerta de sinal vital para quem clicou.
 *
 * Não apaga nada e não altera o prontuário: cria uma linha dizendo que aquele
 * usuário já viu aquela medida daquela aferição.
 *
 * Devolve `void` de propósito, e não um estado de erro: o formulário é um
 * botão só, sem campo para a pessoa errar. As duas únicas entradas inválidas
 * possíveis vêm de adulteração, e para essas o caminho desta casa é lançar —
 * a fronteira de erro trata, e a tentativa vira linha na trilha quando for
 * questão de papel.
 */
export async function acaoDispensarAlerta(dados: FormData): Promise<void> {
  const ctx = await obterCtx()

  const sinalVitalId = String(dados.get('sinalVitalId') ?? '')
  const medidaBruta = String(dados.get('medida') ?? '')

  // A medida vem do formulário e pode ser qualquer coisa. Só passa adiante se
  // for uma das sete — um valor estranho não pode virar linha no banco.
  const medida = MEDIDAS_VITAIS.find((m) => m === medidaBruta) as MedidaVital | undefined
  if (!sinalVitalId || !medida) throw new ErroValidacao('Alerta inválido')

  await dispensarAlerta(ctx, sinalVitalId, medida)
  revalidatePath('/pendencias')
}

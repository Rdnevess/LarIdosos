import { hash, verify, Algorithm } from '@node-rs/argon2'

const OPCOES = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
}

export async function hashSenha(senha: string): Promise<string> {
  return hash(senha, OPCOES)
}

export async function verificarSenha(
  hashArmazenado: string,
  senha: string
): Promise<boolean> {
  try {
    return await verify(hashArmazenado, senha, OPCOES)
  } catch {
    return false
  }
}

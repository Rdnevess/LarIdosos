import { hash, verify } from '@node-rs/argon2'

// Parâmetros recomendados pela OWASP para Argon2id: 19 MiB, 2 iterações,
// paralelismo 1. O algoritmo não é passado explicitamente porque
// `Algorithm.Argon2id` é um const enum de ambiente, inacessível como valor
// sob `isolatedModules` (exigido pelo Next). O padrão da biblioteca já é
// Argon2id, e o teste do prefixo `$argon2id$` trava isso contra regressão.
const OPCOES = {
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
    // Sem OPCOES: a string PHC do hash carrega os próprios parâmetros, e a
    // verificação usa os dela. Passá-los aqui sugeriria, falsamente, que
    // alterar OPCOES invalidaria hashes já gravados.
    return await verify(hashArmazenado, senha)
  } catch {
    return false
  }
}

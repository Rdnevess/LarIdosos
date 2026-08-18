import { randomUUID, createHash } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { ErroValidacao } from './erros'

const EXTENSAO_POR_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const TAMANHO_MAXIMO_BYTES = 20 * 1024 * 1024

export type ArquivoSalvo = {
  caminhoRelativo: string
  hashSha256: string
  tamanhoBytes: number
}

function diretorioBase(): string {
  return path.resolve(process.env.UPLOADS_DIR ?? './data/uploads')
}

export async function salvarArquivo(
  conteudo: Buffer,
  mimeType: string
): Promise<ArquivoSalvo> {
  const extensao = EXTENSAO_POR_MIME[mimeType]
  if (!extensao) {
    throw new ErroValidacao('Tipo de arquivo não permitido. Envie PDF, JPG, PNG ou WEBP.')
  }
  if (conteudo.length > TAMANHO_MAXIMO_BYTES) {
    throw new ErroValidacao('O arquivo excede o limite de 20 MB')
  }

  const agora = new Date()
  const ano = String(agora.getFullYear())
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const nome = `${randomUUID()}.${extensao}`
  const caminhoRelativo = `${ano}/${mes}/${nome}`
  const caminhoAbsoluto = path.join(diretorioBase(), caminhoRelativo)

  await mkdir(path.dirname(caminhoAbsoluto), { recursive: true })
  await writeFile(caminhoAbsoluto, conteudo)

  return {
    caminhoRelativo,
    hashSha256: createHash('sha256').update(conteudo).digest('hex'),
    tamanhoBytes: conteudo.length,
  }
}

export async function lerArquivo(caminhoRelativo: string): Promise<Buffer> {
  const base = diretorioBase()
  const alvo = path.resolve(base, caminhoRelativo)

  if (alvo !== base && !alvo.startsWith(base + path.sep)) {
    throw new ErroValidacao('Caminho de arquivo inválido')
  }

  return readFile(alvo)
}

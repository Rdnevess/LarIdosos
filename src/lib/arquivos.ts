import { randomUUID, createHash } from 'node:crypto'
import { mkdir, writeFile, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { ErroNaoEncontrado, ErroValidacao } from './erros'

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
  if (!caminhoRelativo?.trim()) {
    throw new ErroValidacao('Caminho de arquivo inválido')
  }

  const base = diretorioBase()
  const alvo = path.resolve(base, caminhoRelativo)

  // Contenção lexical: o alvo tem de ser filho da base. O `path.sep` no fim é
  // o que impede um irmão de nome parecido (`/data/uploads-outro`) passar por
  // prefixo. Ler a própria base nunca é válido, daí não haver caso de igualdade.
  if (!alvo.startsWith(base + path.sep)) {
    throw new ErroValidacao('Caminho de arquivo inválido')
  }

  // Contenção física: `path.resolve` é puramente textual e segue link simbólico
  // sem perceber. Um link plantado dentro do volume de uploads apontando para
  // fora dele passaria na checagem acima. `realpath` resolve os links e a
  // contenção é reavaliada sobre o caminho real.
  let real: string
  try {
    real = await realpath(alvo)
  } catch {
    throw new ErroNaoEncontrado('Arquivo não encontrado')
  }

  const baseReal = await realpath(base)
  if (!real.startsWith(baseReal + path.sep)) {
    throw new ErroValidacao('Caminho de arquivo inválido')
  }

  return readFile(real)
}

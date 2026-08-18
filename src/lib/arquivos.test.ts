import { describe, it, expect } from 'vitest'
import { ErroValidacao } from './erros'
import { salvarArquivo, lerArquivo } from './arquivos'

const pdfMinimo = Buffer.from('%PDF-1.4 conteúdo de teste')

describe('salvarArquivo', () => {
  it('grava e devolve caminho, hash e tamanho', async () => {
    const salvo = await salvarArquivo(pdfMinimo, 'application/pdf')

    expect(salvo.tamanhoBytes).toBe(pdfMinimo.length)
    expect(salvo.hashSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(salvo.caminhoRelativo).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/)

    const lido = await lerArquivo(salvo.caminhoRelativo)
    expect(lido.equals(pdfMinimo)).toBe(true)
  })

  it('gera nomes diferentes para conteúdos idênticos', async () => {
    const a = await salvarArquivo(pdfMinimo, 'application/pdf')
    const b = await salvarArquivo(pdfMinimo, 'application/pdf')
    expect(a.caminhoRelativo).not.toBe(b.caminhoRelativo)
    expect(a.hashSha256).toBe(b.hashSha256)
  })

  it('recusa tipo de arquivo não permitido', async () => {
    await expect(
      salvarArquivo(Buffer.from('MZ'), 'application/x-msdownload')
    ).rejects.toThrow(ErroValidacao)
  })

  it('recusa arquivo acima de 20 MB', async () => {
    const grande = Buffer.alloc(20 * 1024 * 1024 + 1)
    await expect(salvarArquivo(grande, 'application/pdf')).rejects.toThrow(ErroValidacao)
  })
})

describe('lerArquivo', () => {
  it('recusa caminho que escapa do diretório base', async () => {
    await expect(lerArquivo('../../.env')).rejects.toThrow(ErroValidacao)
    await expect(lerArquivo('/etc/passwd')).rejects.toThrow(ErroValidacao)
  })
})

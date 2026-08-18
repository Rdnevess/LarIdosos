export class ErroPermissao extends Error {
  constructor(mensagem = 'Acesso negado') {
    super(mensagem)
    this.name = 'ErroPermissao'
  }
}

export class ErroValidacao extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroValidacao'
  }
}

export class ErroNaoEncontrado extends Error {
  constructor(mensagem = 'Registro não encontrado') {
    super(mensagem)
    this.name = 'ErroNaoEncontrado'
  }
}

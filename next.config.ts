import type { NextConfig } from "next";

const ehDesenvolvimento = process.env.NODE_ENV === 'development'

/**
 * Content-Security-Policy.
 *
 * **Mora aqui, e não no `Caddyfile`, de propósito.** Os outros cabeçalhos de
 * segurança ficam no Caddy porque são fixos e valem para o transporte. A CSP é
 * diferente: ela pode quebrar a aplicação inteira com uma diretiva a mais, e um
 * cabeçalho posto no proxy nunca é exercitado pela suíte — o E2E fala com o
 * `next dev` direto, sem passar pelo Caddy. Aqui, as 57 travessias do E2E
 * atravessam esta política a cada execução, e uma diretiva errada aparece como
 * teste vermelho em vez de aparecer em produção.
 *
 * **O que ela compra:** nada de script vindo de fora, nada de `<object>`/plugin,
 * nada de `<base>` injetado para sequestrar URLs relativas, formulário só posta
 * para a própria origem, e a página não pode ser embutida em moldura alguma.
 *
 * **O que ela NÃO compra:** `script-src` precisa de `'unsafe-inline'`, porque o
 * Next injeta o payload dos React Server Components em `<script>` inline
 * (`self.__next_f.push(...)`). Script inline injetado por XSS continua rodando.
 * Fechar isso exige CSP com nonce por requisição, gerado no `middleware.ts` — é
 * o passo seguinte, e é maior do que este.
 *
 * A folga de desenvolvimento é declarada e não escondida: o HMR do webpack usa
 * `eval` e um websocket para a própria origem. Em produção nenhuma das duas
 * entra.
 */
const politicaDeSeguranca = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${ehDesenvolvimento ? " 'unsafe-eval'" : ''}`,
  `connect-src 'self'${ehDesenvolvimento ? ' ws:' : ''}`,
].join('; ')

const nextConfig: NextConfig = {
  // Empacota só as dependências realmente usadas em `.next/standalone`,
  // reduzindo a imagem Docker de ~1 GB para ~200 MB — relevante numa VPS
  // pequena. O Dockerfile copia especificamente essa saída (ver Task 17).
  output: 'standalone',
  poweredByHeader: false,
  experimental: {
    // O limite padrão de corpo de Server Action é 1 MB, e o anexo de documento
    // é uma Server Action: sem isto, a foto de um RG tirada no celular (2-5 MB)
    // era recusada pelo Next antes de chegar ao serviço — sem mensagem na tela.
    // 20 MB é o mesmo teto que `salvarArquivo` aplica, e lá a recusa vira
    // mensagem para o usuário.
    serverActions: { bodySizeLimit: '20mb' },
  },
  async headers() {
    return [
      {
        source: '/:caminho*',
        headers: [{ key: 'Content-Security-Policy', value: politicaDeSeguranca }],
      },
    ]
  },
};

export default nextConfig;

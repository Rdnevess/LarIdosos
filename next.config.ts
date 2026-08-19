import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // O limite padrão de corpo de Server Action é 1 MB, e o anexo de documento
    // é uma Server Action: sem isto, a foto de um RG tirada no celular (2-5 MB)
    // era recusada pelo Next antes de chegar ao serviço — sem mensagem na tela.
    // 20 MB é o mesmo teto que `salvarArquivo` aplica, e lá a recusa vira
    // mensagem para o usuário.
    serverActions: { bodySizeLimit: '20mb' },
  },
};

export default nextConfig;

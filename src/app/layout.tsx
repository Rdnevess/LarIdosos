import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { COOKIE_TEMA, lerTema } from "@/lib/tema";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lar de Idosos",
  description: "Sistema de gestão para Lar de Idosos",
};

/**
 * O tema sai já na resposta do servidor.
 *
 * Como o `data-tema` chega junto com o HTML, nunca existe o lampejo branco
 * antes de escurecer que assombra as implementações baseadas em
 * `localStorage` — lá o tema só é conhecido depois que o JavaScript roda, e a
 * primeira pintura já aconteceu.
 *
 * Sem cookie, `lerTema` devolve `undefined`, o React omite o atributo, e o
 * `@media (prefers-color-scheme: dark)` do `globals.css` assume.
 *
 * Ler cookie aqui torna toda rota dinâmica. Não há perda: o grupo `(app)` já é
 * dinâmico por ler a sessão, e `/login` também.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tema = lerTema((await cookies()).get(COOKIE_TEMA)?.value);

  return (
    <html
      lang="pt-BR"
      data-tema={tema}
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      {/* As variáveis de fonte (`--font-geist-sans`, `--font-geist-mono`) moram no
          `<html>` para que o `:root` do `@theme inline` consiga resolvê-las. Se
          fossem no `<body>`, quando o `@theme inline` tentasse resolver
          `--font-sans: var(--font-geist-sans)` no `:root`, a variável ainda não
          existiria, a resolução falhava, e o `body` caía no fallback. */}
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

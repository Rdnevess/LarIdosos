# syntax=docker/dockerfile:1
#
# Build multi-stage para o Lar de Idosos.
#
# Por que 4 estágios, e não os 3 mais comuns (deps/build/runtime):
#
# `deps`      instala TODAS as dependências (inclui devDependencies:
#             TypeScript, Tailwind, ESLint, Vitest...) — necessárias só
#             para `next build` conseguir rodar.
# `deps-prod` instala só as dependências de produção (`npm ci --omit=dev`).
#             `prisma` e `tsx` foram movidos para `dependencies` no
#             `package.json` porque o entrypoint os executa em todo start
#             do container (`prisma migrate deploy`, `tsx prisma/seed.ts`)
#             — não são ferramenta de build, são runtime. Isolar essa
#             instalação evita que TypeScript/ESLint/Tailwind/Vitest (que
#             o rastreamento do `output: standalone` já deixa de fora)
#             voltem a entrar na imagem final por um caminho lateral.
# `build`     gera o cliente Prisma e roda `next build` (usa `deps`).
# `runtime`   imagem final: saída standalone + node_modules de produção.
#
# Todos os estágios usam a mesma base Alpine (musl). Isso importa porque
# `@node-rs/argon2` e o engine do Prisma são binários nativos: se o
# `npm ci` rodasse numa arquitetura/libc diferente da imagem final, o
# binário instalado não funcionaria em runtime — um erro que só aparece
# no primeiro login, sem pista óbvia da causa.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS deps-prod
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# postgresql18-client: dá ao operador um jeito de rodar
# `docker compose exec app psql "$DATABASE_URL"` para inspeção manual, sem
# precisar instalar nada na VPS. openssl: o engine nativo do Prisma
# depende de libssl em runtime — sem o pacote, `prisma migrate deploy`
# falha ao carregar a biblioteca compartilhada, com um erro que não deixa
# óbvio que a causa é essa.
RUN apk add --no-cache postgresql18-client openssl

# Saída standalone do Next: server.js + node_modules podado com só o que
# o rastreamento de dependências identificou como necessário para servir
# a aplicação. `public/` e `.next/static/` não entram nela — o Next exige
# copiá-los à parte (ver docs oficiais de `output: standalone`).
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Schema e migrations: o entrypoint precisa deles para `prisma migrate
# deploy`, e o seed importa `../src/lib/senha` — por isso `src` também
# entra aqui (só o necessário para o seed rodar via `tsx`, não o projeto
# inteiro).
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json

# node_modules de produção (prisma, tsx, @prisma/client, @node-rs/argon2 e
# demais dependências, com os binários nativos corretos para esta imagem).
# Sobrepõe o node_modules podado do standalone acima: como é um
# superconjunto gerado a partir do mesmo package-lock.json, a sobreposição
# só adiciona os pacotes que o rastreamento do Next não tinha motivo para
# incluir (prisma e tsx não são importados pelo código da aplicação, só
# usados pela CLI no entrypoint).
COPY --from=deps-prod /app/node_modules ./node_modules

# Reafirma por cima o cliente Prisma GERADO (com o engine compilado para
# este schema e para musl/Alpine) — o `deps-prod` acima instalou o pacote
# `@prisma/client`, mas nunca rodou `prisma generate`, então por si só
# teria o client "stub" que lança erro se instanciado. Copiar depois do
# `deps-prod` garante que a versão gerada no estágio `build` prevaleça.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]

# syntax=docker/dockerfile:1

# Estágio de build: instala todas as dependências e compila o TypeScript.
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
# --ignore-scripts: o único script de instalação do lockfile é o postinstall
# "opencollective" do necord, que não é necessário para o bot.
RUN npm ci --ignore-scripts

COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Estágio de runtime: só dependências de produção e o código compilado.
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist ./dist

# Diretório das vagas já publicadas; recebe um volume no compose.yaml.
RUN mkdir -p data && chown node:node data

USER node

CMD ["node", "dist/main.js"]

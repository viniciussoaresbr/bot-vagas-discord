# Bot de Vagas para Discord

Bot feito com [NestJS](https://nestjs.com/) e [Necord](https://necord.org/) (discord.js). Ele busca vagas de tecnologia em repositórios de vagas do GitHub e na [Remotar](https://remotar.com.br/) e as envia para um canal do Discord.

> **Observação:** O bot roda em produção em um servidor doméstico Debian, em um container Docker gerenciado pelo Docker Compose (veja [Implantação com Docker](#implantação-com-docker-servidor-debian)).

<img width="1850" height="925" alt="Captura de tela de 2026-10-01 14-58-44" src="https://github.com/user-attachments/assets/a2b71211-5edc-4e72-b0e3-e437d2dbf14d" />

## Funcionalidades

* Consulta vagas de duas fontes:

  * Issues abertas mais recentes (sem pull requests) de [frontendbr/vagas](https://github.com/frontendbr/vagas), [backend-br/vagas](https://github.com/backend-br/vagas) e [react-brasil/vagas](https://github.com/react-brasil/vagas).
  * Vagas ativas mais recentes da [Remotar](https://remotar.com.br/), pela API pública.
* Filtra as vagas pelas tecnologias citadas no título ou na descrição, comparando palavras inteiras (por exemplo, "java" não casa com "javascript"): React, React Native, Node.js, Angular, Express, NestJS, Next.js, Vue.js, TypeScript, JavaScript, Java, Spring, Python, Django, FastAPI e Laravel.
* Publica cada vaga como embed com título, link, resumo da descrição, tecnologias encontradas e fonte (repositório ou Remotar e empresa).
* Publica no máximo 10 vagas por busca, priorizando as mais recentes, para não inundar o canal.
* Não repete vagas: guarda os links já publicados em `data/published-jobs.json` e também confere as últimas 100 mensagens do canal.
* Faz uma busca ao iniciar e depois repete a cada hora. Cada busca termina com um log de quantas vagas foram analisadas e notificadas.
* Confere se o bot tem acesso e as permissões necessárias no canal e mostra mensagens de erro claras quando algo falta.

## Pré-requisitos

* Node.js `>= 20.19.0`
* Uma aplicação/bot criada no [Discord Developer Portal](https://discord.com/developers/applications)
* O bot adicionado ao servidor com estas permissões no canal de vagas:

  * View Channel
  * Read Message History
  * Send Messages
  * Embed Links

## Configuração

1. Clone o repositório e instale as dependências:

   ```bash
   git clone git@github.com:viniciussoaresbr/bot-vagas-discord.git
   cd bot-vagas-discord
   npm install
   ```

2. Crie um arquivo `.env` na raiz do projeto:

   ```env
   DISCORD_TOKEN=seu-token-do-bot
   DISCORD_JOBS_CHANNEL_ID=id-do-canal-de-vagas
   ```

   | Variável                  | Descrição                                                                                           |
   | ------------------------- | --------------------------------------------------------------------------------------------------- |
   | `DISCORD_TOKEN`           | Token do bot (Developer Portal → Bot → Reset Token).                                                |
   | `DISCORD_JOBS_CHANNEL_ID` | ID do canal onde as vagas serão publicadas (ative o Modo Desenvolvedor e use "Copiar ID do canal"). |
   | `PUBLISHED_JOBS_FILE`     | Opcional. Arquivo onde ficam os links já publicados. Padrão: `data/published-jobs.json`.            |

   > O `.env` e a pasta `data/` já estão no `.gitignore`. Nunca faça commit do token.

## Execução

```bash
# desenvolvimento (recarrega ao salvar)
npm run start:dev

# produção
npm run build
npm run start:prod
```

## Implantação com Docker (servidor Debian)

Em produção, o bot roda em um container Docker gerenciado pelo Docker Compose, em um servidor Linux acessado por SSH.

* **Imagem:** build multi-stage com Node.js 22, executada com usuário sem privilégios (`Dockerfile`).
* **Execução contínua:** `restart: unless-stopped` reinicia o bot após falhas e após reiniciar o servidor, sem depender de sessão SSH aberta.
* **Segredos:** o `.env` é criado direto no servidor (a partir do `.env.example`, com permissão `600`) e nunca entra na imagem nem no Git.
* **Persistência:** as vagas já publicadas ficam no volume `bot-data`.
* **Rede:** nenhuma porta é publicada, pois o bot só faz conexões de saída.

> A política de reinício não resolve queda de energia, falta de internet ou indisponibilidade do Discord. Para o endereço do servidor não mudar, faça uma reserva DHCP no roteador.

### Fluxo de implantação

1. Configure o acesso SSH por chave ao servidor e um atalho no `~/.ssh/config` (o script usa `debian-server` por padrão).
2. No servidor, garanta que o Docker esteja habilitado na inicialização e que o usuário esteja no grupo `docker`.
3. Envie o projeto com `scripts/deploy.sh [host] [diretório]`. Ele usa `rsync` e não envia `node_modules`, `dist`, `data`, `.git` nem o `.env`.
4. No servidor, crie o `.env` a partir do `.env.example` e inicie o bot com `./scripts/bot.sh up`.

### Gerenciamento

No servidor, o `scripts/bot.sh` reúne os comandos do Docker Compose:

| Comando   | Para que serve                                       |
| --------- | ---------------------------------------------------- |
| `up`      | Iniciar ou atualizar após um deploy                  |
| `stop`    | Parar o bot                                          |
| `restart` | Reiniciar (por exemplo, após alterar o `.env`)       |
| `status`  | Estado do container                                  |
| `logs`    | Acompanhar os logs                                   |
| `rebuild` | Reconstruir a imagem com a imagem base atualizada    |
| `shell`   | Entrar no container para diagnóstico                 |
| `stats`   | Consumo de CPU e memória                             |

## Scripts

| Script               | Descrição                                    |
| -------------------- | -------------------------------------------- |
| `npm run build`      | Compila o projeto para `dist/`.              |
| `npm start`          | Inicia o bot com o Nest CLI.                 |
| `npm run start:dev`  | Inicia em modo watch.                        |
| `npm run start:prod` | Executa a versão compilada (`dist/main.js`). |
| `npm run typecheck`  | Verifica os tipos sem gerar arquivos.        |

## Estrutura

```text
src/
├── main.ts                    # bootstrap da aplicação
├── app.module.ts              # módulos (Config, Necord, Schedule, Http) e fontes de vagas
├── jobs.service.ts            # agendamento, filtro e publicação das vagas
├── published-jobs.store.ts    # registro em disco das vagas já publicadas
└── job-sources/
    ├── job-source.ts          # interface comum das fontes de vagas
    ├── github.source.ts       # issues dos repositórios de vagas do GitHub
    └── remotar.source.ts      # API pública da Remotar
```

## Personalização

* **Tecnologias filtradas:** constante `TECHNOLOGY_KEYWORDS`, em `src/jobs.service.ts`.
* **Limite por busca:** constante `MAX_JOBS_PER_SEARCH`, no mesmo arquivo.
* **Frequência da busca:** expressão do `@Cron`, no mesmo arquivo.
* **Repositórios do GitHub:** constante `GITHUB_REPOSITORIES`, em `src/job-sources/github.source.ts`.
* **Nova fonte de vagas:** crie uma classe que implemente `JobSource` em `src/job-sources/` e registre-a nos `providers` e na factory de `JOB_SOURCES`, em `src/app.module.ts`.

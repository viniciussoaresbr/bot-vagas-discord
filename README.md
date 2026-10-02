# Bot de Vagas para Discord

Bot feito com [NestJS](https://nestjs.com/) e [Necord](https://necord.org/) (discord.js). Ele busca vagas de tecnologia em repositórios de vagas do GitHub e na [Remotar](https://remotar.com.br/) e as envia para um canal do Discord.

> **Observação:** O bot está hospedado e em execução em produção no [Render](https://render.com/).

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

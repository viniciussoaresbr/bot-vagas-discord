import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;

  await app.listen(port);

  const logger = new Logger("Bootstrap");
  logger.log(`Aplicação rodando na porta ${port}`);
}

void bootstrap().catch((error: unknown) => {
  const logger = new Logger("Bootstrap");
  logger.error(
    "Não foi possível iniciar o bot.",
    error instanceof Error ? error.stack : String(error),
  );
  process.exitCode = 1;
});

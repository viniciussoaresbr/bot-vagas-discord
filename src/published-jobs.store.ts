import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_STORE_PATH = "data/published-jobs.json";
const MAX_STORED_URLS = 2_000;

/**
 * Guarda as URLs já publicadas em disco, para que vagas antigas não sejam
 * reenviadas quando saírem das últimas mensagens do canal.
 */
@Injectable()
export class PublishedJobsStore {
  private readonly logger = new Logger(PublishedJobsStore.name);
  private readonly filePath: string;
  private urls: string[] | undefined;

  public constructor(configService: ConfigService) {
    this.filePath = configService.get<string>(
      "PUBLISHED_JOBS_FILE",
      DEFAULT_STORE_PATH,
    );
  }

  public async getAll(): Promise<Set<string>> {
    return new Set(await this.load());
  }

  public async add(url: string): Promise<void> {
    const urls = await this.load();

    urls.push(url);
    this.urls = urls.slice(-MAX_STORED_URLS);

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.urls, null, 2));
  }

  private async load(): Promise<string[]> {
    if (this.urls) {
      return this.urls;
    }

    try {
      const content = await readFile(this.filePath, "utf-8");
      this.urls = JSON.parse(content) as string[];
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.logger.warn(
          `Não foi possível ler ${this.filePath}; começando com a lista vazia.`,
        );
      }

      this.urls = [];
    }

    return this.urls;
  }
}

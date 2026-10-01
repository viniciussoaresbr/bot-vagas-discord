import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  Client,
  EmbedBuilder,
  Events,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  TextChannel,
} from "discord.js";

import { Job, JOB_SOURCES, JobSource } from "./job-sources/job-source";
import { PublishedJobsStore } from "./published-jobs.store";

const TECHNOLOGY_KEYWORDS = [
  "react",
  "node.js",
  "node",
  "angular",
  "express.js",
  "express",
  "nest.js",
  "nestjs",
  "next.js",
  "nextjs",
  "vue.js",
  "vue",
  "react native",
  "typescript",
  "javascript",
  "java",
  "spring",
  "python",
  "django",
  "fastapi",
  "laravel",
] as const;

const TECHNOLOGY_PATTERNS = TECHNOLOGY_KEYWORDS.map(keyword => ({
  keyword,
  pattern: new RegExp(
    `${/^[a-z0-9]/.test(keyword) ? "(?<![a-z0-9])" : ""}${keyword.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    )}(?![a-z0-9])`,
  ),
}));

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);
  private readonly jobsChannelId: string;
  private isSearchRunning = false;

  public constructor(
    @Inject(JOB_SOURCES) private readonly jobSources: JobSource[],
    private readonly publishedJobsStore: PublishedJobsStore,
    private readonly discordClient: Client,
    configService: ConfigService,
  ) {
    this.jobsChannelId = configService.getOrThrow<string>(
      "DISCORD_JOBS_CHANNEL_ID",
    );
  }

  public onModuleInit(): void {
    void this.searchAndNotifyJobs();
  }

  @Cron(CronExpression.EVERY_HOUR)
  public async handleHourlyJobSearch(): Promise<void> {
    await this.searchAndNotifyJobs();
  }

  private async searchAndNotifyJobs(): Promise<void> {
    if (this.isSearchRunning) {
      this.logger.warn("Uma busca de vagas já está em execução.");
      return;
    }

    this.isSearchRunning = true;

    try {
      await this.waitForDiscordReady();

      const channel = await this.getJobsChannel();
      const publishedUrls = new Set([
        ...(await this.getPublishedJobUrls(channel)),
        ...(await this.publishedJobsStore.getAll()),
      ]);
      const jobs = await this.fetchJobsFromSources();
      let notifiedCount = 0;

      for (const job of jobs) {
        const technologies = this.findTechnologies(job);

        if (technologies.length === 0 || publishedUrls.has(job.url)) {
          continue;
        }

        await channel.send({
          embeds: [this.createJobEmbed(job, technologies)],
        });

        publishedUrls.add(job.url);
        await this.publishedJobsStore.add(job.url);
        notifiedCount++;
        this.logger.log(`Vaga notificada (${job.source}): ${job.title}`);
      }

      this.logger.log(
        `Busca concluída: ${jobs.length} vagas analisadas, ${notifiedCount} novas vagas notificadas.`,
      );
    } catch (error: unknown) {
      const exception =
        error instanceof Error ? error : new Error(String(error));

      this.logger.error(
        "Não foi possível buscar ou notificar as vagas.",
        exception.stack,
      );
    } finally {
      this.isSearchRunning = false;
    }
  }

  private async waitForDiscordReady(): Promise<void> {
    if (this.discordClient.isReady()) {
      return;
    }

    await new Promise<void>(resolve => {
      this.discordClient.once(Events.ClientReady, () => resolve());
    });
  }

  private async getJobsChannel(): Promise<TextChannel> {
    let channel;

    try {
      channel = await this.discordClient.channels.fetch(this.jobsChannelId);
    } catch (error: unknown) {
      const discordErrorCode = this.getDiscordErrorCode(error);

      if (discordErrorCode === RESTJSONErrorCodes.MissingAccess) {
        throw new Error(
          `O Discord negou o acesso ao canal ${this.jobsChannelId}. ` +
            "Confirme se o bot está no servidor correto e se possui a permissão " +
            "View Channel nesse canal ou na categoria.",
        );
      }

      if (discordErrorCode === RESTJSONErrorCodes.UnknownChannel) {
        throw new Error(
          `O canal ${this.jobsChannelId} não foi encontrado. ` +
            "Confira o DISCORD_JOBS_CHANNEL_ID e copie o ID do canal correto.",
        );
      }

      throw error;
    }

    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      throw new Error(
        `O canal ${this.jobsChannelId} não existe ou não é baseado em texto.`,
      );
    }

    const textChannel = channel as TextChannel;
    const botMember = textChannel.guild.members.me;

    if (!botMember) {
      throw new Error(
        `Não foi possível identificar o bot no servidor do canal ${this.jobsChannelId}.`,
      );
    }

    const permissions = textChannel.permissionsFor(botMember);
    const requiredPermissions = [
      ["View Channel", PermissionFlagsBits.ViewChannel],
      ["Read Message History", PermissionFlagsBits.ReadMessageHistory],
      ["Send Messages", PermissionFlagsBits.SendMessages],
      ["Embed Links", PermissionFlagsBits.EmbedLinks],
    ] as const;
    const missingPermissions = requiredPermissions
      .filter(([, permission]) => !permissions?.has(permission))
      .map(([permissionName]) => permissionName);

    if (missingPermissions.length > 0) {
      throw new Error(
        `O bot não possui no canal ${this.jobsChannelId}: ${missingPermissions.join(
          ", ",
        )}.`,
      );
    }

    return textChannel;
  }

  private async getPublishedJobUrls(
    channel: TextChannel,
  ): Promise<Set<string>> {
    const messages = await channel.messages.fetch({ limit: 100 });
    const publishedUrls = new Set<string>();

    for (const message of messages.values()) {
      for (const embed of message.embeds) {
        if (embed.url) {
          publishedUrls.add(embed.url);
        }
      }
    }

    return publishedUrls;
  }

  private async fetchJobsFromSources(): Promise<Job[]> {
    const responses = await Promise.allSettled(
      this.jobSources.map(source => source.fetchJobs()),
    );
    const jobs: Job[] = [];

    responses.forEach((response, index) => {
      if (response.status === "fulfilled") {
        jobs.push(...response.value);
      } else {
        this.logger.error(
          `Falha ao consultar a fonte ${this.jobSources[index].name}.`,
          this.getErrorMessage(response.reason),
        );
      }
    });

    return jobs;
  }

  private findTechnologies(job: Job): string[] {
    const content = `${job.title} ${job.description}`.toLowerCase();

    return TECHNOLOGY_PATTERNS.filter(({ pattern }) =>
      pattern.test(content),
    ).map(({ keyword }) => keyword);
  }

  private createJobEmbed(job: Job, technologies: string[]): EmbedBuilder {
    const description = this.truncate(
      job.description.replace(/\s+/g, " ").trim() ||
        "Sem descrição disponível para esta vaga.",
      300,
    );

    return new EmbedBuilder()
      .setTitle(this.truncate(job.title, 256))
      .setURL(job.url)
      .setDescription(description)
      .setColor("#00FF7F")
      .addFields(
        {
          name: "Tecnologias encontradas",
          value: technologies.join(", "),
        },
        {
          name: "Fonte",
          value: job.source,
        },
      )
      .setFooter({ text: "Bot Notificador de Vagas de Tecnologia" })
      .setTimestamp(job.createdAt);
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength - 1)}…`;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getDiscordErrorCode(error: unknown): number | undefined {
    if (typeof error !== "object" || error === null || !("code" in error)) {
      return undefined;
    }

    const code = error.code;
    return typeof code === "number" ? code : undefined;
  }
}

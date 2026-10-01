import { HttpService } from "@nestjs/axios";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
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
import { firstValueFrom } from "rxjs";

interface GithubIssue {
  title: string;
  body: string | null;
  html_url: string;
  created_at: string;
}

interface JobIssue extends GithubIssue {
  repository: string;
}

const GITHUB_API_URL = "https://api.github.com/repos";
const GITHUB_REPOSITORIES = [
  "frontendbr/vagas",
  "backend-br/vagas",
  "react-brasil/vagas",
] as const;

const TECHNOLOGY_KEYWORDS = [
  "react",
  "node.js",
  "node",
  "angular",
  "express.js",
  "express",
  "nest.js",
  "nestjs",
] as const;

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);
  private readonly jobsChannelId: string;
  private isSearchRunning = false;

  public constructor(
    private readonly httpService: HttpService,
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
      const publishedUrls = await this.getPublishedJobUrls(channel);
      const issues = await this.fetchIssuesFromGithub();

      for (const issue of issues) {
        const technologies = this.findTechnologies(issue);

        if (technologies.length === 0 || publishedUrls.has(issue.html_url)) {
          continue;
        }

        await channel.send({
          embeds: [this.createJobEmbed(issue, technologies)],
        });

        publishedUrls.add(issue.html_url);
        this.logger.log(`Vaga notificada: ${issue.title}`);
      }
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

  private async fetchIssuesFromGithub(): Promise<JobIssue[]> {
    const responses = await Promise.allSettled(
      GITHUB_REPOSITORIES.map(async (repository): Promise<JobIssue[]> => {
        const url = `${GITHUB_API_URL}/${repository}/issues?state=open&per_page=15`;
        const response = await firstValueFrom(
          this.httpService.get<GithubIssue[]>(url, {
            headers: {
              Accept: "application/vnd.github+json",
              "User-Agent": "bot-vagas-discord",
            },
          }),
        );

        return response.data.map(issue => ({
          ...issue,
          repository,
        }));
      }),
    );

    const issues: JobIssue[] = [];

    for (const response of responses) {
      if (response.status === "fulfilled") {
        issues.push(...response.value);
      } else {
        this.logger.error(
          "Falha ao consultar um repositório do GitHub.",
          this.getErrorMessage(response.reason),
        );
      }
    }

    return issues;
  }

  private findTechnologies(issue: GithubIssue): string[] {
    const content = `${issue.title} ${issue.body ?? ""}`.toLowerCase();

    return TECHNOLOGY_KEYWORDS.filter(keyword => content.includes(keyword));
  }

  private createJobEmbed(
    issue: JobIssue,
    technologies: string[],
  ): EmbedBuilder {
    const description = this.truncate(
      issue.body?.replace(/\s+/g, " ").trim() ||
        "Sem descrição disponível para esta vaga.",
      300,
    );

    return new EmbedBuilder()
      .setTitle(this.truncate(issue.title, 256))
      .setURL(issue.html_url)
      .setDescription(description)
      .setColor("#00FF7F")
      .addFields(
        {
          name: "Tecnologias encontradas",
          value: technologies.join(", "),
        },
        {
          name: "Fonte",
          value: issue.repository,
        },
      )
      .setFooter({ text: "Bot Notificador de Vagas de Tecnologia" })
      .setTimestamp(new Date(issue.created_at));
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

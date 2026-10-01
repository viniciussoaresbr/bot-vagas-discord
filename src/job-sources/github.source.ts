import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { firstValueFrom } from "rxjs";

import { HTTP_TIMEOUT_MS, HTTP_USER_AGENT, Job, JobSource } from "./job-source";

interface GithubIssue {
  title: string;
  body: string | null;
  html_url: string;
  created_at: string;
  pull_request?: unknown;
}

const GITHUB_API_URL = "https://api.github.com/repos";
const GITHUB_REPOSITORIES = [
  "frontendbr/vagas",
  "backend-br/vagas",
  "react-brasil/vagas",
] as const;

@Injectable()
export class GithubJobSource implements JobSource {
  public readonly name = "GitHub";
  private readonly logger = new Logger(GithubJobSource.name);

  public constructor(private readonly httpService: HttpService) {}

  public async fetchJobs(): Promise<Job[]> {
    const responses = await Promise.allSettled(
      GITHUB_REPOSITORIES.map(async (repository): Promise<Job[]> => {
        const url = `${GITHUB_API_URL}/${repository}/issues?state=open&per_page=15`;
        const response = await firstValueFrom(
          this.httpService.get<GithubIssue[]>(url, {
            timeout: HTTP_TIMEOUT_MS,
            headers: {
              Accept: "application/vnd.github+json",
              "User-Agent": HTTP_USER_AGENT,
            },
          }),
        );

        return response.data
          .filter(issue => !issue.pull_request)
          .map(issue => ({
            title: issue.title,
            description: issue.body ?? "",
            url: issue.html_url,
            createdAt: new Date(issue.created_at),
            source: repository,
          }));
      }),
    );

    const jobs: Job[] = [];

    for (const response of responses) {
      if (response.status === "fulfilled") {
        jobs.push(...response.value);
      } else {
        this.logger.error(
          "Falha ao consultar um repositório do GitHub.",
          response.reason instanceof Error
            ? response.reason.message
            : String(response.reason),
        );
      }
    }

    return jobs;
  }
}

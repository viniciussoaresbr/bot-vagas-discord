import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { firstValueFrom } from "rxjs";

import { HTTP_TIMEOUT_MS, HTTP_USER_AGENT, Job, JobSource } from "./job-source";

interface RemotarJob {
  id: number;
  title: string;
  description: string | null;
  createdAt: string;
  active: boolean;
  expired: boolean;
  company: { name: string } | null;
}

interface RemotarResponse {
  data: RemotarJob[];
}

const REMOTAR_API_URL = "https://api.remotar.com.br/jobs?search=desenvolvedor";
const REMOTAR_JOB_URL = "https://remotar.com.br/job";

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

@Injectable()
export class RemotarJobSource implements JobSource {
  public readonly name = "Remotar";

  public constructor(private readonly httpService: HttpService) {}

  public async fetchJobs(): Promise<Job[]> {
    const response = await firstValueFrom(
      this.httpService.get<RemotarResponse>(REMOTAR_API_URL, {
        timeout: HTTP_TIMEOUT_MS,
        headers: { "User-Agent": HTTP_USER_AGENT },
      }),
    );

    return response.data.data
      .filter(job => job.active && !job.expired)
      .map(job => ({
        title: job.title,
        description: this.stripHtml(job.description ?? ""),
        url: `${REMOTAR_JOB_URL}/${job.id}`,
        createdAt: new Date(job.createdAt),
        source: this.name,
        company: job.company?.name,
      }));
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z0-9#]+;/gi, entity => HTML_ENTITIES[entity] ?? " ");
  }
}

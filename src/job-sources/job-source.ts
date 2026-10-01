export interface Job {
  title: string;
  description: string;
  url: string;
  createdAt: Date;
  source: string;
  company?: string;
}

export interface JobSource {
  readonly name: string;
  fetchJobs(): Promise<Job[]>;
}

export const JOB_SOURCES = Symbol("JOB_SOURCES");

export const HTTP_TIMEOUT_MS = 10_000;
export const HTTP_USER_AGENT = "bot-vagas-discord";

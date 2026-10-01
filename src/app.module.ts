import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { GatewayIntentBits } from "discord.js";
import { NecordModule } from "necord";

import { GithubJobSource } from "./job-sources/github.source";
import { JOB_SOURCES, JobSource } from "./job-sources/job-source";
import { JobsService } from "./jobs.service";
import { PublishedJobsStore } from "./published-jobs.store";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    NecordModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        token: configService.getOrThrow<string>("DISCORD_TOKEN"),
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
      }),
    }),
    ScheduleModule.forRoot(),
    HttpModule,
  ],
  providers: [
    GithubJobSource,
    {
      provide: JOB_SOURCES,
      inject: [GithubJobSource],
      useFactory: (...sources: JobSource[]) => sources,
    },
    PublishedJobsStore,
    JobsService,
  ],
})
export class AppModule {}

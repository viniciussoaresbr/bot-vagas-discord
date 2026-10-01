import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { GatewayIntentBits } from "discord.js";
import { NecordModule } from "necord";

import { JobsService } from "./jobs.service";

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
  providers: [JobsService],
})
export class AppModule {}

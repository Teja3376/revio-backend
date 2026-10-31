import { Module } from "@nestjs/common";
import { ENV, loadEnv } from "./config/env";
import { HealthController } from "./health.controller";

@Module({
  controllers: [HealthController],
  providers: [{ provide: ENV, useFactory: () => loadEnv() }],
  exports: [ENV],
})
export class AppModule {}

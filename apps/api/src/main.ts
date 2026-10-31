import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { ENV, type Env } from "./config/env";

async function bootstrap() {
  // rawBody: webhook signatures are computed over the exact bytes GitHub sent.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const env = app.get<Env>(ENV);
  app.enableCors({ origin: env.WEB_ORIGIN });
  app.enableShutdownHooks();

  const doc = new DocumentBuilder().setTitle("Revio API").addBearerAuth().build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, doc));

  await app.listen(env.PORT);
}

await bootstrap();

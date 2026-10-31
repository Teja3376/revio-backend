import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user";
import { SupabaseJwtGuard } from "../auth/jwt.guard";
import { parseBody } from "../common/zod-body";
import { InstallationsService } from "../installations/installations.service";

const LinkBody = z.object({ githubToken: z.string().min(1).max(500) });

@ApiTags("me")
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard)
@Controller("me")
export class MeController {
  constructor(@Inject(InstallationsService) private readonly installs: InstallationsService) {}

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    const me = await this.installs.me(user.id);
    if (!me) throw new NotFoundException({ message: "Link your GitHub account first." });
    return me;
  }

  /** The web app sends the GitHub provider token once after sign-in; it isn't stored. */
  @Post("github-link")
  @HttpCode(200)
  link(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.installs.linkUser(user.id, parseBody(LinkBody, body).githubToken);
  }
}

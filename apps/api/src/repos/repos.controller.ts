import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user";
import { SupabaseJwtGuard } from "../auth/jwt.guard";
import { uuidOr404 } from "../common/uuid";
import { parseBody } from "../common/zod-body";
import { ReposService } from "./repos.service";

const RepoPatch = z
  .object({
    enabled: z.boolean(),
    depth: z.enum(["quick", "normal", "full"]),
    ignoreGlobs: z.array(z.string().trim().min(1).max(200)).max(50),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, { message: "Nothing to change." });

@ApiTags("repos")
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard)
@Controller("repos")
export class ReposController {
  constructor(@Inject(ReposService) private readonly repos: ReposService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { items: await this.repos.list(user.id) };
  }

  @Patch(":id")
  async update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const repoId = uuidOr404(id);
    const updated = await this.repos.update(user.id, repoId, parseBody(RepoPatch, body));
    if (!updated) throw new NotFoundException({ message: "Repository not found." });
    return updated;
  }
}

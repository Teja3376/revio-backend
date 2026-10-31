import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { type AuthUser, CurrentUser } from "../auth/current-user";
import { SupabaseJwtGuard } from "../auth/jwt.guard";
import { uuidOr404 } from "../common/uuid";
import { parseBody } from "../common/zod-body";
import { ReviewsService } from "./reviews.service";

const ListQuery = z.object({
  repo: z.uuid().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

@ApiTags("reviews")
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard)
@Controller("reviews")
export class ReviewsController {
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const q = parseBody(ListQuery, query);
    return this.reviews.list(user.id, q.repo ? { repo: q.repo, page: q.page } : { page: q.page });
  }

  @Get(":id")
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const review = await this.reviews.get(user.id, uuidOr404(id));
    if (!review) throw new NotFoundException({ message: "Review not found." });
    return review;
  }
}

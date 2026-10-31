import { Inject, Injectable } from "@nestjs/common";
import { DB, type Db } from "../database/db";
import type { Depth } from "../database/entities";

export type RepoDto = {
  id: string;
  fullName: string;
  enabled: boolean;
  depth: Depth;
  ignoreGlobs: string[];
};
export type RepoPatch = Partial<Pick<RepoDto, "enabled" | "depth" | "ignoreGlobs">>;

type Row = {
  id: string;
  full_name: string;
  enabled: boolean;
  depth: Depth;
  ignore_globs: string[];
};
const toDto = (r: Row): RepoDto => ({
  id: r.id,
  fullName: r.full_name,
  enabled: r.enabled,
  depth: r.depth,
  ignoreGlobs: r.ignore_globs,
});

// Visible only if GitHub lets the user see the repo (linked per repo, not per installation).
const MINE = "r.id in (select repo_id from user_repos where user_id = $1)";

@Injectable()
export class ReposService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(userId: string): Promise<RepoDto[]> {
    const rows = await this.db.query<Row>(
      `select r.id, r.full_name, r.enabled, r.depth, r.ignore_globs from repos r where ${MINE} order by r.full_name`,
      [userId],
    );
    return rows.map(toDto);
  }

  /** Undefined when the repo doesn't exist or isn't the user's. */
  async update(userId: string, id: string, patch: RepoPatch): Promise<RepoDto | undefined> {
    const [row] = await this.db.query<Row>(
      `update repos r set
         enabled = coalesce($3, r.enabled),
         depth = coalesce($4, r.depth),
         ignore_globs = coalesce($5, r.ignore_globs)
       where r.id = $2 and ${MINE}
       returning r.id, r.full_name, r.enabled, r.depth, r.ignore_globs`,
      [userId, id, patch.enabled ?? null, patch.depth ?? null, patch.ignoreGlobs ?? null],
    );
    return row && toDto(row);
  }
}

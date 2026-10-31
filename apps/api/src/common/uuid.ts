import { NotFoundException } from "@nestjs/common";
import { z } from "zod";

/** A malformed id can't match anything: 404, same as an id the user can't see. */
export function uuidOr404(id: string): string {
  if (!z.uuid().safeParse(id).success) throw new NotFoundException({ message: "Not found." });
  return id;
}

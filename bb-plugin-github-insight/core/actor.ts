import { z } from "zod";

export const actorSchema = z
  .object({ __typename: z.string(), login: z.string().optional() })
  .nullable();

// GitHub types some CI accounts as User, so their login is the only sign.
const MACHINE_LOGIN = /\[bot\]$|-bot$|cicd/i;

export function isOtherPerson(
  actor: { __typename?: string; login?: string } | null | undefined,
  viewer: string,
): boolean {
  return (
    actor?.__typename === "User" && actor.login !== viewer && !MACHINE_LOGIN.test(actor.login ?? "")
  );
}

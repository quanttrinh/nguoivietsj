import { Data, Effect, Result } from "effect";

import { json } from "~/events/server/http";
import type { ApiProblem } from "~/shared/server/api/problems";

/** HTTP failure carried through a server-side Effect workflow. */
export class ApiFailure extends Data.TaggedError("ApiFailure")<{
  readonly status: number;
  readonly body: unknown;
}> {}

/** Fail an Effect workflow with a shared API problem. */
export function apiFailure(problem: ApiProblem): Effect.Effect<never, ApiFailure> {
  return Effect.fail(new ApiFailure({ status: problem.status, body: { error: problem.error } }));
}

/** Run an API Effect, mapping its typed failure to the existing JSON response. */
export async function runApiEffect<A>(
  effect: Effect.Effect<A, ApiFailure>,
  onSuccess: (value: A) => Response,
): Promise<Response> {
  const result = await Effect.runPromise(Effect.result(effect));

  if (Result.isFailure(result)) {
    return json(result.failure.body, result.failure.status);
  }

  return onSuccess(result.success);
}

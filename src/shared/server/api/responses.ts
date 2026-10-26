import { json } from "~/events/server/http";
import { API_PROBLEM, type ApiProblem } from "~/shared/server/api/problems";

/** Build a JSON API error response with the shared no-store policy. */
export function apiProblemResponse(problem: ApiProblem): Response {
  return json({ error: problem.error }, problem.status);
}

export function invalidEventId(): Response {
  return apiProblemResponse(API_PROBLEM.invalidEventId);
}

export function invalidRegistrationId(): Response {
  return apiProblemResponse(API_PROBLEM.invalidRegistrationId);
}

export function invalidEventSlug(): Response {
  return apiProblemResponse(API_PROBLEM.invalidEventSlug);
}

export function eventNotFound(): Response {
  return apiProblemResponse(API_PROBLEM.eventNotFound);
}

export function registrationNotFound(): Response {
  return apiProblemResponse(API_PROBLEM.registrationNotFound);
}

export function forbidden(): Response {
  return apiProblemResponse(API_PROBLEM.forbidden);
}

export function invalidPayload(fields?: readonly string[]): Response {
  return json(
    {
      error: API_PROBLEM.invalidPayload.error,
      ...(fields === undefined ? {} : { fields: [...fields] }),
    },
    API_PROBLEM.invalidPayload.status,
  );
}

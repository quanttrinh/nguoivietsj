// @boundary client
import { REGISTRATION_VALIDATION_CODE } from "~/events/domain/form-schema/constants";
import type {
  RegistrationFormIssue,
  RegistrationValidationCode,
} from "~/events/domain/form-schema/types";
import type { Messages, Widen } from "~/generated/i18n-types";
import type { ApiIssue } from "~/shared/api/response";
import { apiClient, apiResponseMessage } from "~/shared/client/api/client";
import { clientLogger } from "~/shared/client/logger";
import { isRecord } from "~/shared/utils/records";

import type { RegistrationPayload } from "./registration-form-state";

export type RegistrationErrorMessages = Widen<Messages["engineRegistration"]["errors"]>;

export interface RegistrationSuccess {
  id: string;
  statusUrl?: string | undefined;
  emailQueued: boolean;
  warnings: ApiIssue[];
}

export type RegistrationSubmissionResult =
  | { status: "success"; success: RegistrationSuccess }
  | {
      status: "issues";
      errors: Record<string, string>;
      first: RegistrationFormIssue;
      message: string;
      issues: ApiIssue[];
    }
  | { status: "error"; message: string };

const VALIDATION_MESSAGE_KEY: Record<RegistrationValidationCode, keyof RegistrationErrorMessages> =
  {
    [REGISTRATION_VALIDATION_CODE.required]: "required",
    [REGISTRATION_VALIDATION_CODE.invalidEmail]: "email",
    [REGISTRATION_VALIDATION_CODE.invalidPhone]: "phone",
    [REGISTRATION_VALIDATION_CODE.invalidPostalCode]: "postalCode",
    [REGISTRATION_VALIDATION_CODE.invalidNumber]: "invalidNumber",
    [REGISTRATION_VALIDATION_CODE.invalidOption]: "invalidOption",
    [REGISTRATION_VALIDATION_CODE.atLeastOneContact]: "atLeastOneContact",
    [REGISTRATION_VALIDATION_CODE.confirmationRequired]: "confirmationRequired",
    [REGISTRATION_VALIDATION_CODE.confirmationContact]: "confirmationContact",
    [REGISTRATION_VALIDATION_CODE.confirmationMultiple]: "confirmationMultiple",
    [REGISTRATION_VALIDATION_CODE.confirmationNotAllowed]: "confirmationNotAllowed",
    [REGISTRATION_VALIDATION_CODE.duplicateContact]: "duplicateContact",
    [REGISTRATION_VALIDATION_CODE.groupOneOf]: "groupOneOf",
    [REGISTRATION_VALIDATION_CODE.groupAtLeastOne]: "groupAtLeastOne",
    [REGISTRATION_VALIDATION_CODE.groupAllOf]: "groupAllOf",
    [REGISTRATION_VALIDATION_CODE.ticketUnavailable]: "ticketUnavailable",
    [REGISTRATION_VALIDATION_CODE.unknownAnswer]: "invalidValue",
    [REGISTRATION_VALIDATION_CODE.invalidValue]: "invalidValue",
  };

function issueMessage(issue: RegistrationFormIssue, messages: RegistrationErrorMessages) {
  return messages[VALIDATION_MESSAGE_KEY[issue.code]];
}

function mapIssues(
  issues: readonly RegistrationFormIssue[],
  messages: RegistrationErrorMessages,
): {
  errors: Record<string, string>;
  first: RegistrationFormIssue;
  message: string;
  issues: ApiIssue[];
} | null {
  const first = issues[0];

  if (first === undefined) {
    return null;
  }

  const errors: Record<string, string> = {};
  const localized: ApiIssue[] = [];

  for (const issue of issues) {
    const message = issueMessage(issue, messages);

    errors[issue.ref] = message;
    localized.push({ code: issue.code, ref: issue.ref, message });
  }

  return { errors, first, message: issueMessage(first, messages), issues: localized };
}

const register = apiClient.api.events[":slug"].registrations.$post;
const registerManual = apiClient.api.admin.events[":eventId"].registrations.manual.$post;

function isFormIssue(value: unknown): value is RegistrationFormIssue {
  return (
    typeof value === "object" &&
    value !== null &&
    "ref" in value &&
    typeof value.ref === "string" &&
    "code" in value &&
    typeof value.code === "string"
  );
}

function issuesFromError(data: unknown): RegistrationFormIssue[] {
  if (!isRecord(data) || !isRecord(data.error)) {
    return [];
  }

  const issues = Array.isArray(data.error.issues) ? data.error.issues.filter(isFormIssue) : [];
  const known = new Set(issues.map((issue) => issue.ref));
  const fields = Array.isArray(data.error.fields) ? data.error.fields : [];

  return [
    ...issues,
    ...fields
      .filter((ref): ref is string => typeof ref === "string" && ref.length > 0 && !known.has(ref))
      .map((ref) => ({ ref, code: REGISTRATION_VALIDATION_CODE.invalidValue })),
  ];
}

async function failureResult(
  response: { ok: false; json: () => Promise<unknown> },
  messages: RegistrationErrorMessages,
): Promise<RegistrationSubmissionResult> {
  const data: unknown = await response.json();
  const mapped = mapIssues(issuesFromError(data), messages);

  if (mapped !== null) {
    return { status: "issues", ...mapped };
  }

  return {
    status: "error",
    message: apiResponseMessage(data, messages.submit),
  };
}

function successResult(data: {
  data: {
    registration: { id: string; statusUrl?: string };
    emailQueued: boolean;
  };
  meta?: { warnings?: ApiIssue[] | undefined };
}): RegistrationSubmissionResult {
  return {
    status: "success",
    success: {
      id: data.data.registration.id,
      statusUrl: data.data.registration.statusUrl,
      emailQueued: data.data.emailQueued,
      warnings: data.meta?.warnings ?? [],
    },
  };
}

/** POST a public registration and translate the response into UI-ready state. */
export async function postRegistration(
  slug: string,
  payload: RegistrationPayload,
  messages: RegistrationErrorMessages,
): Promise<RegistrationSubmissionResult> {
  try {
    const { turnstileToken, ...body } = payload;
    const response = await register({
      param: { slug },
      json: body,
      ...(turnstileToken.length > 0 ? { header: { "x-turnstile-token": turnstileToken } } : {}),
    });

    if (!response.ok) {
      return await failureResult(response, messages);
    }

    return successResult(await response.json());
  } catch (error) {
    clientLogger.error(error);
    return { status: "error", message: messages.submit };
  }
}

/** POST a staff-assisted registration that bypasses public registration checks. */
export async function postStaffRegistration(
  eventId: string,
  payload: RegistrationPayload,
  messages: RegistrationErrorMessages,
): Promise<RegistrationSubmissionResult> {
  try {
    const { turnstileToken: _, ...body } = payload;
    const response = await registerManual({
      param: { eventId },
      json: body,
    });

    if (!response.ok) {
      return await failureResult(response, messages);
    }

    return successResult(await response.json());
  } catch (error) {
    clientLogger.error(error);
    return { status: "error", message: messages.submit };
  }
}

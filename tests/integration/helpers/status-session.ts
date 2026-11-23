const COOKIE_NAME = "status_session";

/** The full `Set-Cookie` header for a status session, or an empty string. */
export function statusSessionSetCookie(response: Response): string {
  return response.headers.getSetCookie().find((value) => value.startsWith(`${COOKIE_NAME}=`)) ?? "";
}

/** The `name=value` pair for a status session, suitable for a Cookie header. */
export function statusSessionCookie(response: Response): string {
  return statusSessionSetCookie(response).split(";")[0] ?? "";
}

/** The raw status token from a session cookie. */
export function statusSessionToken(response: Response): string {
  return statusSessionCookie(response).slice(`${COOKIE_NAME}=`.length);
}

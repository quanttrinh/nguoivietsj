// @boundary server
import { getSessionCookie, parseCookies } from "better-auth/cookies";

/** Strip the HMAC signature from a signed Better Auth cookie value. */
function cookieIdentity(value: string | null) {
  if (value === null) {
    return null;
  }

  const [rawIdentity = ""] = value.split(".");
  const identity = rawIdentity.trim();
  return identity.length === 0 ? null : identity.slice(0, 128);
}

/**
 * Key by signed session or two-factor cookie. These endpoints carry no email,
 * and both credentials rotate per sign-in; the IP/email limiters cover the gap.
 */
export function accountKey(scope: string, request: Request): string | null {
  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  const identity =
    cookieIdentity(getSessionCookie(request)) ??
    cookieIdentity(
      cookies.get("better-auth.two_factor") ??
        cookies.get("__Secure-better-auth.two_factor") ??
        null,
    );

  return identity === null ? null : `${scope}:${identity}`;
}

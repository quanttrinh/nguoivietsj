// @boundary shared
/**
 * Whether the user still needs to enroll in two-factor auth before using
 * staff APIs.
 *
 * `twoFactorRequired` defaults to true, so a missing value (for example in an
 * older cached session) is treated as required. Enrolled users are never sent
 * back to enrollment; the two-factor plugin still challenges them at sign-in.
 */
export function requiresTwoFactorEnrollment(user: Record<string, unknown>): boolean {
  return user.twoFactorRequired !== false && user.twoFactorEnabled !== true;
}

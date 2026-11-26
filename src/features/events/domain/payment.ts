// @boundary shared
/** True when a payment covers the full amount due. */
export function isRegistrationPaid(
  payment: { amountMinor: number } | null,
  amountDue: number,
): boolean {
  return amountDue === 0 || (payment !== null && payment.amountMinor >= amountDue);
}

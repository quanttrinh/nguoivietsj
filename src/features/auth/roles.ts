// @boundary shared
export const USER_ROLE = {
  user: "user",
  admin: "admin",
  event_staff: "event_staff",
  event_checkin: "event_checkin",
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

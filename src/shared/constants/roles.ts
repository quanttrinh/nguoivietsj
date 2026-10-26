export const USER_ROLE = {
  admin: "admin",
  staff: "staff",
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

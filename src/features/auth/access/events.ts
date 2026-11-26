// @boundary shared
import { defineFeaturePermissions } from "~/features/auth/feature-permissions";

/**
 * Event-engine permissions.
 *
 * Keep resource names and actions close to the routes they protect so the
 * permission matrix can grow with the feature without touching the auth setup.
 */
export const eventsPermissions = defineFeaturePermissions("event")({
  statement: {
    event: ["list", "read", "create", "update"],
    eventActivity: ["read"],
    eventForm: ["read", "write"],
    eventSupport: ["read"],
    eventCheckin: ["read", "write"],
    eventPayment: ["read", "write"],
    eventRegistration: ["read", "create", "manual"],
    eventQr: ["read"],
    eventTicket: ["read", "write"],
  },
  roles: {
    admin: {
      event: ["list", "read", "create", "update"],
      eventActivity: ["read"],
      eventForm: ["read", "write"],
      eventSupport: ["read"],
      eventCheckin: ["read", "write"],
      eventPayment: ["read", "write"],
      eventRegistration: ["read", "create", "manual"],
      eventQr: ["read"],
      eventTicket: ["read", "write"],
    },
    event_staff: {
      event: ["list", "read"],
      eventActivity: ["read"],
      eventSupport: ["read"],
      eventCheckin: ["read", "write"],
      eventPayment: ["read", "write"],
      eventRegistration: ["read", "manual"],
      eventQr: ["read"],
    },
    event_checkin: {
      eventCheckin: ["read", "write"],
    },
  },
});

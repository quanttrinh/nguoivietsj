import { createAuditRepository, type AuditRepository } from "~/db/events/audit";
import { createCheckinRepository, type CheckinRepository } from "~/db/events/checkins";
import {
  createEmailDeliveryRepository,
  type EmailDeliveryRepository,
} from "~/db/events/email-deliveries";
import { createEventRepository, type EventRepository } from "~/db/events/events";
import { createFormVersionRepository, type FormVersionRepository } from "~/db/events/form-versions";
import { createPaymentRepository, type PaymentRepository } from "~/db/events/payments";
import {
  createRegistrationStatusRepository,
  type RegistrationStatusRepository,
} from "~/db/events/registration-status";
import {
  createRegistrationRepository,
  type RegistrationRepository,
} from "~/db/events/registrations";
import { createTicketTypeRepository, type TicketTypeRepository } from "~/db/events/ticket-types";

import { createEngineOrm } from "./orm";

export interface EngineDb {
  audit: AuditRepository;
  checkins: CheckinRepository;
  events: EventRepository;
  emailDeliveries: EmailDeliveryRepository;
  formVersions: FormVersionRepository;
  ticketTypes: TicketTypeRepository;
  registrations: RegistrationRepository;
  payments: PaymentRepository;
  registrationStatus: RegistrationStatusRepository;
}

/** Construct the event-engine repository layer for one D1 binding. */
export function createEngineDb(db: D1Database): EngineDb {
  const orm = createEngineOrm(db);

  return {
    audit: createAuditRepository(orm),
    checkins: createCheckinRepository(orm),
    events: createEventRepository(orm),
    emailDeliveries: createEmailDeliveryRepository(orm),
    formVersions: createFormVersionRepository(orm),
    ticketTypes: createTicketTypeRepository(orm),
    registrations: createRegistrationRepository(orm),
    payments: createPaymentRepository(orm),
    registrationStatus: createRegistrationStatusRepository(orm),
  };
}

export type { EngineOrm } from "./orm";

export type { AuditRepository } from "~/db/events/audit";
export type { CheckinRepository } from "~/db/events/checkins";
export type { EmailDeliveryRepository } from "~/db/events/email-deliveries";
export type { EventRepository } from "~/db/events/events";
export type { FormVersionRepository } from "~/db/events/form-versions";
export type { PaymentRepository } from "~/db/events/payments";
export type { RegistrationStatusRepository } from "~/db/events/registration-status";
export type { RegistrationRepository } from "~/db/events/registrations";
export type { TicketTypeRepository } from "~/db/events/ticket-types";

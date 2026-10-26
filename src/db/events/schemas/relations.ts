// @boundary server
import { defineRelations } from "drizzle-orm";

import { auditEvents, emailDeliveries } from "./audit";
import { eventAliases, eventSlugClaims, events, registrationStats } from "./events";
import { eventFormVersions } from "./forms";
import {
  checkins,
  payments,
  registrationFieldValues,
  registrationStatusOtps,
  registrationStatusSessions,
  registrationTickets,
} from "./registration-details";
import { registrationContacts, registrations } from "./registrations";
import { eventTicketLimits, eventTicketTypes, ticketTypeStats } from "./ticket-types";

const relationsSchema = {
  events,
  eventAliases,
  eventSlugClaims,
  registrationStats,
  eventTicketLimits,
  eventTicketTypes,
  ticketTypeStats,
  eventFormVersions,
  registrations,
  registrationContacts,
  registrationTickets,
  registrationFieldValues,
  checkins,
  payments,
  registrationStatusOtps,
  registrationStatusSessions,
  auditEvents,
  emailDeliveries,
};

export const relations = defineRelations(relationsSchema, (rel) => ({
  events: {
    aliases: rel.many.eventAliases({ from: rel.events.id, to: rel.eventAliases.eventId }),
    slugClaims: rel.many.eventSlugClaims({ from: rel.events.id, to: rel.eventSlugClaims.eventId }),
    stats: rel.one.registrationStats({ from: rel.events.id, to: rel.registrationStats.eventId }),
    limits: rel.one.eventTicketLimits({ from: rel.events.id, to: rel.eventTicketLimits.eventId }),
    ticketTypes: rel.many.eventTicketTypes({
      from: rel.events.id,
      to: rel.eventTicketTypes.eventId,
    }),
    formVersions: rel.many.eventFormVersions({
      from: rel.events.id,
      to: rel.eventFormVersions.eventId,
    }),
  },
  eventAliases: {
    event: rel.one.events({ from: rel.eventAliases.eventId, to: rel.events.id }),
  },
  eventSlugClaims: {
    event: rel.one.events({ from: rel.eventSlugClaims.eventId, to: rel.events.id }),
  },
  eventTicketTypes: {
    event: rel.one.events({ from: rel.eventTicketTypes.eventId, to: rel.events.id }),
    stats: rel.one.ticketTypeStats({
      from: [rel.eventTicketTypes.eventId, rel.eventTicketTypes.key],
      to: [rel.ticketTypeStats.eventId, rel.ticketTypeStats.ticketTypeKey],
    }),
  },
  ticketTypeStats: {
    ticketType: rel.one.eventTicketTypes({
      from: [rel.ticketTypeStats.eventId, rel.ticketTypeStats.ticketTypeKey],
      to: [rel.eventTicketTypes.eventId, rel.eventTicketTypes.key],
    }),
  },
  eventFormVersions: {
    event: rel.one.events({ from: rel.eventFormVersions.eventId, to: rel.events.id }),
  },
  registrations: {
    event: rel.one.events({ from: rel.registrations.eventId, to: rel.events.id }),
    contacts: rel.many.registrationContacts({
      from: rel.registrations.id,
      to: rel.registrationContacts.registrationId,
    }),
    tickets: rel.many.registrationTickets({
      from: rel.registrations.id,
      to: rel.registrationTickets.registrationId,
    }),
    answers: rel.many.registrationFieldValues({
      from: rel.registrations.id,
      to: rel.registrationFieldValues.registrationId,
    }),
    payment: rel.one.payments({
      from: rel.registrations.id,
      to: rel.payments.registrationId,
    }),
    checkin: rel.one.checkins({
      from: rel.registrations.id,
      to: rel.checkins.registrationId,
    }),
    statusOtps: rel.many.registrationStatusOtps({
      from: rel.registrations.id,
      to: rel.registrationStatusOtps.registrationId,
    }),
    statusSessions: rel.many.registrationStatusSessions({
      from: rel.registrations.id,
      to: rel.registrationStatusSessions.registrationId,
    }),
  },
  registrationContacts: {
    registration: rel.one.registrations({
      from: rel.registrationContacts.registrationId,
      to: rel.registrations.id,
    }),
  },
  registrationTickets: {
    registration: rel.one.registrations({
      from: rel.registrationTickets.registrationId,
      to: rel.registrations.id,
    }),
  },
  registrationFieldValues: {
    registration: rel.one.registrations({
      from: rel.registrationFieldValues.registrationId,
      to: rel.registrations.id,
    }),
  },
  payments: {
    registration: rel.one.registrations({
      from: rel.payments.registrationId,
      to: rel.registrations.id,
    }),
  },
  checkins: {
    registration: rel.one.registrations({
      from: rel.checkins.registrationId,
      to: rel.registrations.id,
    }),
  },
  registrationStatusOtps: {
    registration: rel.one.registrations({
      from: rel.registrationStatusOtps.registrationId,
      to: rel.registrations.id,
    }),
  },
  registrationStatusSessions: {
    registration: rel.one.registrations({
      from: rel.registrationStatusSessions.registrationId,
      to: rel.registrations.id,
    }),
  },
  auditEvents: {
    event: rel.one.events({ from: rel.auditEvents.eventId, to: rel.events.id }),
  },
}));

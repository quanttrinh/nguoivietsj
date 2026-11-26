// @boundary client
import type { FetcherStore } from "@nanostores/query";

import type { UserRole } from "~/features/auth/roles";
import { apiClient, readApiJson, requirePagination } from "~/platform/client/api/client";
import { mutateCache, revalidateKeys } from "~/platform/client/query/client";
import { queryStore } from "~/platform/client/query/registry";
import { resolveBrowserLocale } from "~/platform/i18n";

import { rememberEventTitle, rememberEventTitles } from "./event-titles";

export type AdminPaymentFilter = "" | "paid" | "unpaid";
export type AdminCheckinFilter = "" | "checked_in" | "not_checked_in";

export interface AdminSupportFilters {
  query: string;
  payment: AdminPaymentFilter;
  checkin: AdminCheckinFilter;
  before: string;
  after: string;
}

export type AdminUserSearchField = "email" | "name";

export interface AdminUsersFilters {
  query: string;
  field: AdminUserSearchField;
  role: "" | UserRole;
  page: number;
}

const getEvents = apiClient.api.admin.events.$get;
const getEvent = apiClient.api.admin.events[":eventId"].$get;
const getEventTitle = apiClient.api.admin.events[":eventId"].title.$get;
const getOverview = apiClient.api.admin.events[":eventId"].overview.$get;
const getActivity = apiClient.api.admin.events[":eventId"].activity.$get;
const getSupport = apiClient.api.admin.events[":eventId"].support.$get;
const getFormVersions = apiClient.api.admin.events[":eventId"]["form-versions"].$get;
const getRegistration =
  apiClient.api.admin.events[":eventId"].registrations[":registrationId"].$get;
const getRegistrationQr =
  apiClient.api.admin.events[":eventId"].registrations[":registrationId"].qr.$get;
const getUsers = apiClient.api.admin.users.$get;

const SUPPORT_FILTER_SEPARATOR = ":";

/**
 * Include the active locale in admin query keys. Server error messages are
 * localized, so an English error must not be reused after switching language.
 */
function adminQueryKey(key: string) {
  return `${key}:${resolveBrowserLocale()}`;
}

function adminQueryStore<TData>(key: string, fetcher: () => Promise<TData>): FetcherStore<TData> {
  return queryStore(adminQueryKey(key), fetcher);
}

function supportFilterKey(filters: AdminSupportFilters) {
  return [filters.query, filters.payment, filters.checkin, filters.before, filters.after]
    .map((part) => encodeURIComponent(part))
    .join(SUPPORT_FILTER_SEPARATOR);
}

/** Queries owned by the admin event pages. */
export const adminQueries = {
  events: (page: number) =>
    adminQueryStore(`admin:events:${page}`, async () => {
      const payload = await readApiJson(await getEvents({ query: { page: String(page) } }));
      const data = { ...payload.data, ...requirePagination(payload.meta) };

      rememberEventTitles(data.events);

      return data;
    }),

  eventTitle: (eventId: string) =>
    adminQueryStore(`admin:event-title:${eventId}`, async () => {
      const payload = await readApiJson(await getEventTitle({ param: { eventId } }));

      rememberEventTitle(payload.data.event);

      return payload.data;
    }),

  event: (eventId: string) =>
    adminQueryStore(`admin:event:${eventId}`, async () => {
      const payload = await readApiJson(await getEvent({ param: { eventId } }));

      rememberEventTitle(payload.data.event);

      return payload.data;
    }),

  overview: (eventId: string) =>
    adminQueryStore(`admin:overview:${eventId}`, async () => {
      const payload = await readApiJson(await getOverview({ param: { eventId } }));

      rememberEventTitle(payload.data.event);

      // The overview carries the full event; seed the detail query so opening
      // the edit form reuses it instead of issuing another request.
      mutateCache(adminQueryKey(`admin:event:${eventId}`), { event: payload.data.event });

      return payload.data;
    }),

  activity: (eventId: string) =>
    adminQueryStore(`admin:activity:${eventId}`, async () => {
      const payload = await readApiJson(await getActivity({ param: { eventId } }));

      rememberEventTitle(payload.data.event);

      return payload.data;
    }),

  // Unlike the other factories, `registration` and `support` keep the full
  // envelope: their screens read `meta` (notably keyset cursors) as well as
  // `data`. Consumers must use `payload.data` / `payload.meta` for these two.
  registration: (eventId: string, registrationId: string) =>
    adminQueryStore(`admin:registration:${eventId}:${registrationId}`, async () => {
      const payload = await readApiJson(
        await getRegistration({
          param: { eventId, registrationId },
        }),
      );

      rememberEventTitle(payload.data.event);

      return payload;
    }),

  support: (eventId: string, filters: AdminSupportFilters) =>
    adminQueryStore(`admin:support:${eventId}:${supportFilterKey(filters)}`, async () => {
      const payload = await readApiJson(
        await getSupport({
          param: { eventId },
          query: {
            q: filters.query,
            ...(filters.payment === "" ? {} : { payment: filters.payment }),
            ...(filters.checkin === "" ? {} : { checkin: filters.checkin }),
            ...(filters.before === "" ? {} : { before: filters.before }),
            ...(filters.after === "" ? {} : { after: filters.after }),
          },
        }),
      );

      rememberEventTitle(payload.data.event);

      return payload;
    }),

  formVersions: (eventId: string) =>
    adminQueryStore(`admin:form-versions:${eventId}`, async () => {
      const payload = await readApiJson(await getFormVersions({ param: { eventId } }));

      rememberEventTitle(payload.data.event);

      return payload.data;
    }),

  users: (filters: AdminUsersFilters) =>
    adminQueryStore(
      `admin:users:${filters.page}:${filters.field}:${filters.role}:${filters.query}`,
      async () => {
        const payload = await readApiJson(
          await getUsers({
            query: {
              page: String(filters.page),
              ...(filters.query.length === 0 ? {} : { q: filters.query, field: filters.field }),
              ...(filters.role === "" ? {} : { role: filters.role }),
            },
          }),
        );
        return { ...payload.data, ...requirePagination(payload.meta) };
      },
    ),

  registrationQr: (eventId: string, registrationId: string) =>
    adminQueryStore(`admin:qr:${eventId}:${registrationId}`, async () => {
      const payload = await readApiJson(
        await getRegistrationQr({
          param: { eventId, registrationId },
        }),
      );

      rememberEventTitle(payload.data.event);

      return payload.data;
    }),
};

const matchesPrefix = (key: string, prefix: string) =>
  key === prefix || key.startsWith(`${prefix}:`);

/**
 * Revalidate every cached query affected by a successful admin write.
 * Revalidation keeps stale data visible while the fresh response loads.
 */
export const adminRefresh = {
  afterEventWrite(eventId: string): void {
    // Every query below embeds the event, so an event edit invalidates all of
    // them. Prefixes mirror the factory keys exactly (`admin:qr` is the
    // `registrationQr` cache key).
    revalidateKeys((key) => matchesPrefix(key, "admin:events"));
    revalidateKeys((key) => matchesPrefix(key, `admin:event:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:event-title:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:overview:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:activity:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:registration:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:support:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:form-versions:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:qr:${eventId}`));
  },

  afterArchive(eventId: string): void {
    adminRefresh.afterEventWrite(eventId);
  },

  afterTicketTypeWrite(eventId: string): void {
    revalidateKeys((key) => matchesPrefix(key, `admin:event:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:overview:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:support:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:activity:${eventId}`));
  },

  afterRegistrationWrite(eventId: string): void {
    revalidateKeys((key) => matchesPrefix(key, "admin:events"));
    revalidateKeys((key) => matchesPrefix(key, `admin:event:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:overview:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:registration:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:support:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:activity:${eventId}`));
  },

  afterCheckinWrite(eventId: string): void {
    revalidateKeys((key) => matchesPrefix(key, `admin:overview:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:registration:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:support:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:activity:${eventId}`));
  },

  afterPaymentWrite(eventId: string): void {
    revalidateKeys((key) => matchesPrefix(key, `admin:overview:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:registration:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:support:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:qr:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:activity:${eventId}`));
  },

  afterUserWrite(): void {
    revalidateKeys((key) => matchesPrefix(key, "admin:users"));
  },

  afterFormVersionWrite(eventId: string): void {
    revalidateKeys((key) => matchesPrefix(key, `admin:form-versions:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:overview:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:activity:${eventId}`));
  },
};

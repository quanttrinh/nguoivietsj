// @boundary client
import { resolveBrowserLocale } from "@intlayer/core/localization";
/* oxlint-disable typescript/explicit-module-boundary-types -- query factories infer their response type. */
import { type FetcherStore } from "@nanostores/query";

import { type UserRole } from "~/auth/roles";
import { apiClient, readApiJson } from "~/shared/client/api/client";
import { mutateCache, revalidateKeys } from "~/shared/client/query/client";
import { queryStore } from "~/shared/client/query/registry";

import { rememberEventTitle, rememberEventTitles } from "./event-titles";

export type AdminPaymentFilter = "" | "paid" | "unpaid";
export type AdminCheckinFilter = "" | "checked_in" | "not_checked_in";

export interface AdminSupportFilters {
  query: string;
  payment: AdminPaymentFilter;
  checkin: AdminCheckinFilter;
  page: number;
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
const getPayments = apiClient.api.admin.events[":eventId"].payments.$get;
const getSupport = apiClient.api.admin.events[":eventId"].support.$get;
const getFormVersions = apiClient.api.admin.events[":eventId"]["form-versions"].$get;
const getRegistrationQr =
  apiClient.api.admin.events[":eventId"].registrations[":registrationId"].qr.$get;
const getUsers = apiClient.api.admin.users.$get;

const SUPPORT_FILTER_SEPARATOR = ":";

/**
 * Include the active locale in admin query keys. Server error messages are
 * localized, so an English error must not be reused after switching language.
 */
function adminQueryKey(key: string): string {
  return `${key}:${resolveBrowserLocale()}`;
}

function adminQueryStore<TData>(key: string, fetcher: () => Promise<TData>): FetcherStore<TData> {
  return queryStore(adminQueryKey(key), fetcher);
}

function supportFilterKey(filters: AdminSupportFilters): string {
  return [filters.query, filters.payment, filters.checkin, String(filters.page)]
    .map((part) => encodeURIComponent(part))
    .join(SUPPORT_FILTER_SEPARATOR);
}

/** Queries owned by the admin event pages. */
export const adminQueries = {
  events: (page: number) =>
    adminQueryStore(`admin:events:${page}`, async () => {
      const payload = await readApiJson(await getEvents({ query: { page: String(page) } }));
      const pagination = payload.meta.pagination;
      const data = {
        ...payload.data,
        page: pagination?.page ?? page,
        pageSize: pagination?.pageSize ?? payload.data.events.length,
        total: pagination?.total ?? payload.data.events.length,
        totalPages: pagination?.totalPages ?? 1,
      };

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

  payments: (eventId: string) =>
    adminQueryStore(`admin:payments:${eventId}`, async () => {
      const payload = await readApiJson(await getPayments({ param: { eventId } }));

      rememberEventTitle(payload.data.event);

      return payload.data;
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
            page: String(filters.page),
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
        const pagination = payload.meta.pagination;

        return {
          ...payload.data,
          page: pagination?.page ?? filters.page,
          pageSize: pagination?.pageSize ?? payload.data.users.length,
          total: pagination?.total ?? payload.data.users.length,
          totalPages: pagination?.totalPages ?? 1,
        };
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

const matchesPrefix = (key: string, prefix: string): boolean =>
  key === prefix || key.startsWith(`${prefix}:`);

/**
 * Revalidate every cached query affected by a successful admin write.
 * Revalidation keeps stale data visible while the fresh response loads.
 */
export const adminRefresh = {
  afterEventWrite(eventId: string): void {
    revalidateKeys((key) => matchesPrefix(key, "admin:events"));
    revalidateKeys((key) => matchesPrefix(key, `admin:event:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:event-title:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:overview:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:activity:${eventId}`));
  },

  afterArchive(eventId: string): void {
    adminRefresh.afterEventWrite(eventId);
  },

  afterTicketTypeWrite(eventId: string): void {
    revalidateKeys((key) => matchesPrefix(key, `admin:event:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:overview:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:payments:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:support:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:activity:${eventId}`));
  },

  afterRegistrationWrite(eventId: string): void {
    revalidateKeys((key) => matchesPrefix(key, "admin:events"));
    revalidateKeys((key) => matchesPrefix(key, `admin:event:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:overview:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:payments:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:support:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:activity:${eventId}`));
  },

  afterCheckinWrite(eventId: string): void {
    revalidateKeys((key) => matchesPrefix(key, `admin:overview:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:support:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:activity:${eventId}`));
  },

  afterPaymentWrite(eventId: string): void {
    revalidateKeys((key) => matchesPrefix(key, `admin:payments:${eventId}`));
    revalidateKeys((key) => matchesPrefix(key, `admin:overview:${eventId}`));
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

// @boundary client
import type { AdminContentValues } from "~/events/content/admin.content";
import type { EventStatus } from "~/events/domain/constants";

export type EventStatusLabels = Pick<
  AdminContentValues,
  "active" | "upcoming" | "draft" | "archived"
>;

const STATUS_LABEL_KEYS: Record<EventStatus, keyof EventStatusLabels> = {
  active: "active",
  upcoming: "upcoming",
  draft: "draft",
  archived: "archived",
};

export function eventStatusText(status: EventStatus, labels: EventStatusLabels): string {
  return labels[STATUS_LABEL_KEYS[status]];
}

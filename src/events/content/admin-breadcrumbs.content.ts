// @boundary shared
import type { Dictionary } from "intlayer";

import engineAdminContent from "./admin.content";

const source = engineAdminContent.content;

const adminBreadcrumbsContent = {
  key: "engineAdminBreadcrumbs",
  content: {
    administration: source.adminHome,
    users: source.manageUsers,
    events: source.manageEvents,
    event: source.event,
    newEvent: source.newEvent,
    editEvent: source.editEvent,
    form: source.newForm,
    payments: source.payments,
    support: source.support,
    activity: source.activity,
    checkin: source.checkIn,
    qr: source.qrCode,
    registration: source.registrationDetail,
    clone: source.cloneEvent,
    newTicketType: source.newTicketType,
    editTicketType: source.editTicketType,
  },
} satisfies Dictionary;

export type AdminBreadcrumbsValues = {
  [Key in keyof typeof adminBreadcrumbsContent.content]: string;
};

export default adminBreadcrumbsContent;

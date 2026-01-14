import { doGet } from './webapp';
import {
  registerEntry,
  getTotalTicketStatus,
  getRegistrationData,
  getRegistrationDataFromQRPayload,
  checkIn,
  sendInitialConfirmationEmails,
  sendInitialConfirmationEmailsUI,
  sendFinalConfirmationEmails,
  sendFinalConfirmationEmailsUI,
} from './registration';
import { validatePassword } from './password';
import {
  getAdminConfig,
  setAdminConfig,
  getAvailableRoutes,
  openAdminUI,
} from './admin-panel';
import { onOpen } from './menu';

export {
  doGet,
  registerEntry,
  getTotalTicketStatus,
  getRegistrationData,
  getRegistrationDataFromQRPayload,
  checkIn,
  sendInitialConfirmationEmails,
  sendInitialConfirmationEmailsUI,
  sendFinalConfirmationEmails,
  sendFinalConfirmationEmailsUI,
  validatePassword,
  getAdminConfig,
  setAdminConfig,
  getAvailableRoutes,
  onOpen,
  openAdminUI,
};

export type ServerApi = typeof import('./index');


import { doGet, doPost } from './webapp';
import {
  registerEntry,
  getTotalTicketStatus,
  getRegistrationData,
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
  doPost,
  registerEntry,
  getTotalTicketStatus,
  getRegistrationData,
  validatePassword,
  getAdminConfig,
  setAdminConfig,
  getAvailableRoutes,
  onOpen,
  openAdminUI,
};

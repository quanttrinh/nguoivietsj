import { CONTACT_KIND } from "~/events/domain/constants";
import {
  FORM_CONFIRMATION_MODE,
  FORM_FIELD_WIDTH,
  FORM_REF,
  ticketRef,
} from "~/events/domain/form-schema/constants";
import {
  FORM_SCHEMA_VERSION,
  type FormSchema,
  type LocalizedText,
} from "~/events/domain/form-schema/types";

function text(en: string, fr: string, vi: string): LocalizedText {
  return { en, fr, vi };
}

/** Build a valid starting point for a new event form version. */
export function createStarterFormSchema(activeTicketTypeKeys: readonly string[]): FormSchema {
  const section = "registration";

  return {
    version: FORM_SCHEMA_VERSION,
    contacts: {
      email: {
        required: true,
        width: FORM_FIELD_WIDTH.full,
        label: text("Email", "Courriel", "Email"),
      },
      phone: {
        required: false,
        width: FORM_FIELD_WIDTH.full,
        label: text("Phone", "Téléphone", "Số điện thoại"),
      },
      mail: {
        required: false,
        width: FORM_FIELD_WIDTH.full,
        label: text("Mailing address", "Adresse postale", "Địa chỉ thư"),
      },
      confirmation: {
        mode: FORM_CONFIRMATION_MODE.optional,
        methods: [CONTACT_KIND.email],
      },
    },
    sections: [
      {
        key: section,
        order: 10,
        label: text("Registration", "Inscription", "Đăng ký"),
      },
    ],
    fields: [
      { ref: FORM_REF.fullName, section, order: 10, width: FORM_FIELD_WIDTH.full },
      { ref: FORM_REF.contactEmail, section, order: 20, width: FORM_FIELD_WIDTH.full },
      { ref: FORM_REF.contactPhone, section, order: 30, width: FORM_FIELD_WIDTH.full },
      { ref: FORM_REF.contactMail, section, order: 40, width: FORM_FIELD_WIDTH.full },
      { ref: FORM_REF.confirmation, section, order: 50, width: FORM_FIELD_WIDTH.full },
      ...activeTicketTypeKeys.map((key, index) => ({
        ref: ticketRef(key),
        section,
        order: 60 + index,
        width: FORM_FIELD_WIDTH.full,
      })),
      { ref: FORM_REF.consent, section, order: 100, width: FORM_FIELD_WIDTH.full },
    ],
  };
}

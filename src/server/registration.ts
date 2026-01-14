import './polyfills/TextDecoder';
import './polyfills/TextEncoder';

import { encodeQR } from 'qr';

import { addDays, isEqual } from 'date-fns';

import { RegistrationData } from '~/types/registration';
import { INTERNAL_METADATA } from './constants';
import { getManifest, getRouteManifest } from './webapp';
import type { meta } from '~/web/routes/registration/index.json';

const LOCK_TIMEOUT_MS = 5000 as const;
const SHEET_NAME = 'Registrations' as const;
const CONFIRMATION_INITIAL_TEMPLATE_FILE =
  'server/templates/registration-initial-confirm' as const;
const CONFIRMATION_FINAL_TEMPLATE_FILE =
  'server/templates/registration-final-confirm' as const;
const ROUTE_NAME = '/registration' as const;

// const SUMMARY_COLUMNS = {
//   TOTAL_TICKETS: 0,
//   MAX_TOTAL_TICKETS: 1,
//   REMAINING_TICKETS: 2,
//   ADULT_TICKET_PRICE: 3,
//   CHILD_TICKET_PRICE: 4,
// } as const;

const REGISTRATION_COLUMNS = {
  TOTAL: 0,
  REMAINING: 1,
  ETRANSFER: 2,
  CASH: 3,
  NOTES: 4,
  SUBMISSION_DATE: 6,
  SESSION_ID: 7,
  FIRST_NAME: 8,
  LAST_NAME: 9,
  PHONE_NUMBER: 10,
  CONFIRMATION_METHOD: 11,
  EMAIL: 12,
  ADDRESS: 13,
  NUMBER_OF_ADULT_TICKETS: 14,
  NUMBER_OF_CHILD_TICKETS: 15,
  CONFIRMATION_1: 16,
  CONFIRMATION_2: 17,
  CHECKED_IN: 18,
} as const;

const DATE_FORMAT = 'yyyy-MM-dd hh:mm:ss a XXX' as const;

function getMetaData(
  metaName: keyof typeof meta,
  routeMetadata?: Record<string, unknown>
): string {
  const metadata =
    routeMetadata ||
    JSON.parse(
      PropertiesService.getScriptProperties().getProperty(
        INTERNAL_METADATA.ROUTE_METADATA
      ) || '{}'
    );

  return String(
    metadata[ROUTE_NAME]?.[metaName] ||
      getRouteManifest(getManifest()?.routes[ROUTE_NAME] || '')?.meta?.[
        metaName
      ]?.defaultValue ||
      ''
  );
}

function getCurrentTotalTickets(
  registrationSheet?: GoogleAppsScript.Spreadsheet.Sheet | null
): number | undefined {
  const sheet =
    registrationSheet || SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);

  if (!sheet) {
    return undefined;
  }

  const totalTicketsCell = sheet.getRange('A2');
  const totalTicketsValue = totalTicketsCell.getValue();

  if (typeof totalTicketsValue === 'number') {
    return totalTicketsValue;
  } else {
    return undefined;
  }
}

function getTotalTicketStatus(): {
  currentTotalTickets: number | undefined;
  maxTotalTickets: number;
} {
  const maxTotalTickets = Number(getMetaData('MAX_TICKETS'));
  return {
    currentTotalTickets: getCurrentTotalTickets(),
    maxTotalTickets: Number.isNaN(maxTotalTickets) ? 0 : maxTotalTickets,
  };
}

function isValidRegistrationData(obj: unknown): obj is RegistrationData {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  return (
    (typeof (obj as Record<string, unknown>)['firstName'] === 'string' &&
      typeof (obj as Record<string, unknown>)['lastName'] === 'string' &&
      typeof (obj as Record<string, unknown>)['phoneNumber'] === 'string' &&
      typeof (obj as Record<string, unknown>)['email'] === 'string' &&
      typeof (obj as Record<string, unknown>)['numberOfAdultTickets'] ===
        'number' &&
      typeof (obj as Record<string, unknown>)['numberOfChildTickets'] ===
        'number' &&
      (obj as Record<string, unknown>)['confirmationMethod'] === 'email' &&
      typeof (obj as Record<string, unknown>)['email'] === 'string') ||
    ((obj as Record<string, unknown>)['confirmationMethod'] === 'mail' &&
      typeof (obj as Record<string, unknown>)['address'] === 'string')
  );
}

function registerEntry(formData: unknown, sessionID: string): void {
  if (!sessionID) {
    throw new Error('code_5'); // Missing session ID for registration.
  }

  if (!isValidRegistrationData(formData)) {
    throw new Error('code_4'); // Invalid form data provided for registration.
  }

  const trimmedFirstName = formData.firstName.trim();
  const trimmedLastName = formData.lastName.trim();
  const trimmedPhoneNumber = formData.phoneNumber.trim();
  const trimmedConfirmationMethod = formData.confirmationMethod.trim();
  const trimmedEmail =
    trimmedConfirmationMethod === 'email'
      ? ((formData as { email?: string }).email?.trim() ?? '')
      : '';
  const trimmedAddress =
    trimmedConfirmationMethod === 'mail'
      ? ((formData as { address?: string }).address?.trim() ?? '')
      : '';

  const payload = [
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), DATE_FORMAT),
    `'${sessionID}`,
    `'${trimmedFirstName}`,
    `'${trimmedLastName}`,
    `'${trimmedPhoneNumber}`,
    `'${trimmedConfirmationMethod}`,
    `'${trimmedEmail}`,
    `'${trimmedAddress}`,
    `${formData.numberOfAdultTickets}`,
    `${formData.numberOfChildTickets}`,
  ];

  const activeSpreadsheet = SpreadsheetApp.getActive();
  let sheet = activeSpreadsheet.getSheetByName(SHEET_NAME);

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw new Error('code_1'); // Could not obtain lock
  }

  try {
    const max = Number(getMetaData('MAX_TICKETS'));
    const totalTickets =
      formData.numberOfAdultTickets +
      formData.numberOfChildTickets +
      (getCurrentTotalTickets(sheet) || 0);

    if (totalTickets > max) {
      throw new Error('code_3'); // Exceeds maximum ticket limit
    }

    // Check for email or phone number duplicates
    if (sheet) {
      const dataValues = sheet.getDataRange().getValues();
      dataValues.splice(0, 4); // Skip header rows

      for (const row of dataValues) {
        const existingPhone = String(row[REGISTRATION_COLUMNS.PHONE_NUMBER]);
        const existingEmail = String(row[REGISTRATION_COLUMNS.EMAIL]);

        if (
          existingPhone === trimmedPhoneNumber ||
          (trimmedConfirmationMethod === 'email' &&
            existingEmail === trimmedEmail)
        ) {
          throw new Error(
            'code_2' // Duplicate registration detected
          );
        }
      }
    }

    if (!sheet) {
      sheet = activeSpreadsheet.insertSheet('Registrations');

      // Get ticket prices from metadata
      const adultPrice = Number(getMetaData('TICKET_PRICE_ADULT'));
      const childPrice = Number(getMetaData('TICKET_PRICE_CHILD'));
      const maxTickets = Number(getMetaData('MAX_TICKETS'));

      const range = sheet.getRange(1, 1, 5, 19);
      const firstRowPadding = new Array(14).fill('');
      range.setValues([
        [
          'Total Tickets',
          'Max Total Tickets',
          'Remaining Tickets',
          'Adult Ticket Price',
          'Child Ticket Price',
          ...firstRowPadding,
        ],
        [
          [
            '=SUM(',
            'BYROW(',
            'FILTER({ARRAYFORMULA(VALUE(A5:A)), H5:H, O5:O + P5:P}, H5:H <> ""),',
            'LAMBDA(r,',
            'IF(',
            'INDEX(r,1,1) = MAX(FILTER(ARRAYFORMULA(VALUE(A5:A)), H5:H = INDEX(r,1,2))),',
            'INDEX(r,1,3),',
            '0',
            ')',
            ')',
            ')',
            ')',
          ].join(''),
          maxTickets,
          '=$B$2 - $A$2',
          adultPrice,
          childPrice,
          ...firstRowPadding,
        ],
        ['', '', '', '', '', ...firstRowPadding],
        [
          'Total',
          'Balance',
          'ETransfer',
          'Cash',
          'Notes',
          '',
          'Submission Date',
          'Session ID',
          'First Name',
          'Last Name',
          'Phone Number',
          'Confirmation Method',
          'Email',
          'Address',
          'Number of Adult Tickets',
          'Number of Child Tickets',
          'Confirmation 1',
          'Confirmation 2',
          'Checked In',
        ],
        [
          '=$D$2*$O$5+$E$2*$P$5',
          '=$A$5 - $C$5 - $D$5',
          '',
          '',
          '',
          '',
          ...payload,
          '',
          '',
          '',
        ],
      ]);

      // Protect the entire sheet, but allow editing of ETransfer (C) and Cash (D) columns
      const protection = sheet
        .protect()
        .setDescription('Registration Data Protection');

      // Ensure the current user is an editor
      protection.addEditor(Session.getEffectiveUser());

      // Remove all existing editors (only owner can edit by default)
      protection.removeEditors(protection.getEditors());

      // Disable domain-wide editing if applicable
      if (protection.canDomainEdit()) {
        protection.setDomainEdit(false);
      }

      // Set unprotected ranges (ETransfer, Cash and Notes columns)
      protection.setUnprotectedRanges([sheet.getRange('C5:E')]);

      // Add conditional formatting rules
      const rules = sheet.getConditionalFormatRules();

      // Balance (Column B) - Highlight if balance > 0 (amount still owed)
      const balanceRule = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberNotBetween(0, 0)
        .setBackground('#FCE5CD') // Light orange background
        .setFontColor('#E69138') // Dark orange text
        .setRanges([sheet.getRange('B5:B')])
        .build();

      // Balance (Column B) - Highlight if balance = 0 (fully paid)
      const balancePaidRule = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberEqualTo(0)
        .setBackground('#D9EAD3') // Light green background
        .setFontColor('#6AA84F') // Dark green text
        .setRanges([sheet.getRange('B5:B')])
        .build();

      // Confirmation 1 (Column Q) - Success/Sent
      const confirmation1SuccessRule = SpreadsheetApp.newConditionalFormatRule()
        .whenTextStartsWith('Sent:')
        .setBackground('#D9EAD3') // Light green background
        .setFontColor('#6AA84F') // Dark green text
        .setRanges([sheet.getRange('Q5:Q')])
        .build();

      // Confirmation 1 (Column Q) - Failed/Error
      const confirmation1ErrorRule = SpreadsheetApp.newConditionalFormatRule()
        .whenTextStartsWith('Failed:')
        .setBackground('#F4CCCC') // Light red background
        .setFontColor('#CC0000') // Dark red text
        .setRanges([sheet.getRange('Q5:Q')])
        .build();

      // Confirmation 2 (Column R) - Success/Sent
      const confirmation2SuccessRule = SpreadsheetApp.newConditionalFormatRule()
        .whenTextStartsWith('Sent:')
        .setBackground('#D9EAD3') // Light green background
        .setFontColor('#6AA84F') // Dark green text
        .setRanges([sheet.getRange('R5:R')])
        .build();

      // Confirmation 2 (Column R) - Failed/Error
      const confirmation2ErrorRule = SpreadsheetApp.newConditionalFormatRule()
        .whenTextStartsWith('Failed:')
        .setBackground('#F4CCCC') // Light red background
        .setFontColor('#CC0000') // Dark red text
        .setRanges([sheet.getRange('R5:R')])
        .build();

      // ETransfer, Cash, and Notes columns (C, D, E) - Light gray background when row has data
      // Check if Session ID column (H) is not empty to determine if row exists
      const eTransferBgRule = SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=$H5<>""')
        .setBackground('#F3F3F3') // Light gray background
        .setRanges([sheet.getRange('C5:C')])
        .build();

      const cashBgRule = SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=$H5<>""')
        .setBackground('#F3F3F3') // Light gray background
        .setRanges([sheet.getRange('D5:D')])
        .build();

      const notesBgRule = SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=$H5<>""')
        .setBackground('#F3F3F3') // Light gray background
        .setRanges([sheet.getRange('E5:E')])
        .build();

      // Apply all rules
      rules.push(
        balanceRule,
        balancePaidRule,
        confirmation1SuccessRule,
        confirmation1ErrorRule,
        confirmation2SuccessRule,
        confirmation2ErrorRule,
        eTransferBgRule,
        cashBgRule,
        notesBgRule
      );
      sheet.setConditionalFormatRules(rules);
    } else {
      // Add row with formulas that use ROW() function to automatically reference current row
      sheet.appendRow([
        '=$D$2*INDIRECT("O"&ROW())+$E$2*INDIRECT("P"&ROW())',
        '=INDIRECT("A"&ROW()) - INDIRECT("C"&ROW()) - INDIRECT("D"&ROW())',
        '',
        '',
        '',
        '',
        ...payload,
        '', // Confirmation 1
        '', // Confirmation 2
        '', // Checked In
      ]);
    }
  } catch (error) {
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function getRegistrationData(sessionID: string):
  | (RegistrationData & {
      registrationDate: Date;
      notes: string;
      checkedIn: Date | undefined;
      sessionId: string;
    })
  | undefined {
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);

    if (!sheet) {
      return undefined;
    }

    const dataValues = sheet.getDataRange().getValues();

    for (let i = dataValues.length - 1; i > 3; i--) {
      const row = dataValues[i];
      if (row[REGISTRATION_COLUMNS.SESSION_ID] === sessionID) {
        let checkedInDate = undefined;
        try {
          checkedInDate = Utilities.parseDate(
            String(row[REGISTRATION_COLUMNS.CHECKED_IN]),
            Session.getScriptTimeZone(),
            DATE_FORMAT
          );
        } catch {}
        return {
          sessionId: String(row[REGISTRATION_COLUMNS.SESSION_ID]),
          firstName: String(row[REGISTRATION_COLUMNS.FIRST_NAME]),
          lastName: String(row[REGISTRATION_COLUMNS.LAST_NAME]),
          phoneNumber: String(row[REGISTRATION_COLUMNS.PHONE_NUMBER]),
          confirmationMethod: String(
            row[REGISTRATION_COLUMNS.CONFIRMATION_METHOD]
          ) as 'email' | 'mail',
          email: String(row[REGISTRATION_COLUMNS.EMAIL]),
          address: String(row[REGISTRATION_COLUMNS.ADDRESS]),
          numberOfAdultTickets: Number(
            row[REGISTRATION_COLUMNS.NUMBER_OF_ADULT_TICKETS]
          ),
          numberOfChildTickets: Number(
            row[REGISTRATION_COLUMNS.NUMBER_OF_CHILD_TICKETS]
          ),
          registrationDate: Utilities.parseDate(
            String(row[REGISTRATION_COLUMNS.SUBMISSION_DATE]),
            Session.getScriptTimeZone(),
            DATE_FORMAT
          ),
          notes: String(row[REGISTRATION_COLUMNS.NOTES]),
          checkedIn: checkedInDate,
        };
      }
    }
  } catch {}

  return undefined;
}

function getSanitizedRegistrationData(
  sessionID: string
): RegistrationData | undefined {
  const fullData = getRegistrationData(sessionID);
  if (!fullData) {
    return undefined;
  }

  return {
    firstName: fullData.firstName,
    lastName: fullData.lastName,
    phoneNumber: fullData.phoneNumber,
    confirmationMethod: fullData.confirmationMethod as 'email' | 'mail',
    email: (fullData as { email?: string }).email,
    address: (fullData as { address?: string }).address,
    numberOfAdultTickets: fullData.numberOfAdultTickets,
    numberOfChildTickets: fullData.numberOfChildTickets,
  };
}

function getAliasEmail(eventYear: number): string | undefined {
  const matcher = /(?<=\+tetviet)\d+(?=@gmail\.com)/gm;

  const aliases = GmailApp.getAliases();

  for (const alias of aliases) {
    const match = alias.toLocaleLowerCase().match(matcher);
    const matchYear = match ? Number(match[0]) : 0;
    if (match && matchYear === eventYear) {
      return alias;
    }
  }

  return undefined;
}

interface MailMergeResult {
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  errors: { row: number; error: string }[];
}

/**
 * Sends confirmation emails to registrants
 * @param maxEmails Maximum number of emails to send (default: 100)
 * @returns Result summary of the mail merge operation
 */
function sendInitialConfirmationEmails(
  maxEmails: number = MailApp.getRemainingDailyQuota()
): MailMergeResult {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error(`${SHEET_NAME} sheet not found`);
  }

  const dataValues = sheet.getDataRange().getValues();
  dataValues.splice(0, 4); // Skip header rows

  const template = HtmlService.createTemplateFromFile(
    CONFIRMATION_INITIAL_TEMPLATE_FILE
  );

  const routeMetadata = JSON.parse(
    PropertiesService.getScriptProperties().getProperty(
      INTERNAL_METADATA.ROUTE_METADATA
    ) || '{}'
  );

  const eventYear = Number(getMetaData('EVENT_YEAR', routeMetadata));

  const result: MailMergeResult = {
    totalProcessed: 0,
    successCount: 0,
    failureCount: 0,
    errors: [],
  };

  const fromEmail = getAliasEmail(eventYear);

  // Acquire lock to prevent concurrent executions
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw new Error(
      'Could not obtain lock for sending emails. Please try again later.'
    );
  }

  try {
    for (const registrationEntry of dataValues) {
      if (result.totalProcessed >= maxEmails) {
        break;
      }

      const confirmationStatus = String(
        registrationEntry[REGISTRATION_COLUMNS.CONFIRMATION_1] || ''
      ).trim();

      // Skip if already successfully sent
      if (confirmationStatus.toLowerCase().startsWith('sent:')) {
        continue;
      }

      const confirmationMethod = String(
        registrationEntry[REGISTRATION_COLUMNS.CONFIRMATION_METHOD]
      );
      const email = String(registrationEntry[REGISTRATION_COLUMNS.EMAIL]);

      // Skip if no email address for email confirmation method
      if (confirmationMethod !== 'email' || !email) {
        continue;
      }

      result.totalProcessed++;

      const submissionDate = new Date(
        registrationEntry[REGISTRATION_COLUMNS.SUBMISSION_DATE]
      );
      const firstName = String(
        registrationEntry[REGISTRATION_COLUMNS.FIRST_NAME]
      );
      const lastName = String(
        registrationEntry[REGISTRATION_COLUMNS.LAST_NAME]
      );
      const phoneNumber = String(
        registrationEntry[REGISTRATION_COLUMNS.PHONE_NUMBER]
      );
      const numberOfAdultTickets = Number(
        registrationEntry[REGISTRATION_COLUMNS.NUMBER_OF_ADULT_TICKETS]
      );
      const numberOfChildTickets = Number(
        registrationEntry[REGISTRATION_COLUMNS.NUMBER_OF_CHILD_TICKETS]
      );
      const totalPrice = Number(registrationEntry[REGISTRATION_COLUMNS.TOTAL]);

      try {
        // Replace placeholders in template
        template.firstName = firstName;
        template.lastName = lastName;
        template.phoneNumber = phoneNumber;
        template.numberOfAdultTickets = String(numberOfAdultTickets);
        template.numberOfChildTickets = String(numberOfChildTickets);
        template.totalTickets = String(
          numberOfAdultTickets + numberOfChildTickets
        );
        template.totalPrice = totalPrice.toFixed(2);
        template.currency = getMetaData('CURRENCY', routeMetadata);
        template.submissionDate = Utilities.formatDate(
          submissionDate,
          Session.getScriptTimeZone(),
          DATE_FORMAT
        );
        template.paymentDeadline = Utilities.formatDate(
          addDays(new Date(), 7),
          Session.getScriptTimeZone(),
          'yyyy-MM-dd XXX'
        );
        template.email = email;
        template.etransferEmail = getMetaData('ETRANSFER_EMAIL', routeMetadata);
        template.cashAddress = getMetaData('CASH_ADDRESS', routeMetadata);

        const emailBody = template.evaluate().getContent();

        // Send email
        GmailApp.sendEmail(
          email,
          'Xác Nhận Đăng Ký / Registration Confirmation',
          '',
          {
            from: fromEmail,
            name: `Tết Việt ${eventYear}`,
            htmlBody: emailBody,
            replyTo: getMetaData('CONTACT_EMAIL', routeMetadata) || undefined,
          }
        );

        registrationEntry[REGISTRATION_COLUMNS.CONFIRMATION_1] =
          `Sent: ${Utilities.formatDate(
            new Date(),
            Session.getScriptTimeZone(),
            DATE_FORMAT
          )}`;

        result.successCount++;
      } catch (error) {
        registrationEntry[REGISTRATION_COLUMNS.CONFIRMATION_1] =
          `Failed: ${(error as Error).message}`;
        result.errors.push({
          row: result.totalProcessed + 4, // Adjust for header rows
          error: (error as Error).message,
        });

        result.failureCount++;
      }
    }

    sheet
      .getRange(
        5,
        REGISTRATION_COLUMNS.CONFIRMATION_1 + 1,
        dataValues.length,
        1
      )
      .setValues(
        dataValues.map((row) => [row[REGISTRATION_COLUMNS.CONFIRMATION_1]])
      );

    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Generates a QR code as a Blob
 * @param data The data to encode in the QR code
 * @returns Object containing the PNG blob and unicode representation
 */
function generateQRCodeGif(
  data: string,
  name: string
): GoogleAppsScript.Base.Blob {
  const qrCode = encodeQR(data, 'gif', {
    ecc: 'high',
    border: 4,
    scale: 8,
  });
  return Utilities.newBlob(Array.from(qrCode), 'image/gif', name + '.gif');
}

/**
 * Sends final confirmation emails with QR codes to registrants who have paid in full (balance = 0)
 * @param maxEmails Maximum number of emails to send (default: remaining daily quota)
 * @returns Result summary of the mail merge operation
 */
function sendFinalConfirmationEmails(
  maxEmails: number = MailApp.getRemainingDailyQuota()
): MailMergeResult {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error(`${SHEET_NAME} sheet not found`);
  }

  const dataValues = sheet.getDataRange().getValues();
  dataValues.splice(0, 4); // Skip header rows

  const template = HtmlService.createTemplateFromFile(
    CONFIRMATION_FINAL_TEMPLATE_FILE
  );

  const routeMetadata = JSON.parse(
    PropertiesService.getScriptProperties().getProperty(
      INTERNAL_METADATA.ROUTE_METADATA
    ) || '{}'
  );

  const eventYear = Number(getMetaData('EVENT_YEAR', routeMetadata));

  const result: MailMergeResult = {
    totalProcessed: 0,
    successCount: 0,
    failureCount: 0,
    errors: [],
  };

  const fromEmail = getAliasEmail(eventYear);

  // Acquire lock to prevent concurrent executions
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw new Error(
      'Could not obtain lock for sending emails. Please try again later.'
    );
  }

  try {
    for (const registrationEntry of dataValues) {
      if (result.totalProcessed >= maxEmails) {
        break;
      }

      const confirmationStatus = String(
        registrationEntry[REGISTRATION_COLUMNS.CONFIRMATION_2] || ''
      ).trim();

      // Skip if already successfully sent
      if (confirmationStatus.toLowerCase().startsWith('sent:')) {
        continue;
      }

      // Check if balance is 0 (fully paid)
      const balance = Number(registrationEntry[REGISTRATION_COLUMNS.REMAINING]);
      if (balance !== 0) {
        continue;
      }

      const confirmationMethod = String(
        registrationEntry[REGISTRATION_COLUMNS.CONFIRMATION_METHOD]
      );
      const email = String(registrationEntry[REGISTRATION_COLUMNS.EMAIL]);

      // Skip if no email address for email confirmation method
      if (confirmationMethod !== 'email' || !email) {
        continue;
      }

      result.totalProcessed++;

      const submissionDate = new Date(
        registrationEntry[REGISTRATION_COLUMNS.SUBMISSION_DATE]
      );
      const sessionId = String(
        registrationEntry[REGISTRATION_COLUMNS.SESSION_ID]
      );
      const firstName = String(
        registrationEntry[REGISTRATION_COLUMNS.FIRST_NAME]
      );
      const lastName = String(
        registrationEntry[REGISTRATION_COLUMNS.LAST_NAME]
      );
      const phoneNumber = String(
        registrationEntry[REGISTRATION_COLUMNS.PHONE_NUMBER]
      );
      const numberOfAdultTickets = Number(
        registrationEntry[REGISTRATION_COLUMNS.NUMBER_OF_ADULT_TICKETS]
      );
      const numberOfChildTickets = Number(
        registrationEntry[REGISTRATION_COLUMNS.NUMBER_OF_CHILD_TICKETS]
      );
      const totalPrice = Number(registrationEntry[REGISTRATION_COLUMNS.TOTAL]);
      const etransferAmount = Number(
        registrationEntry[REGISTRATION_COLUMNS.ETRANSFER]
      );
      const cashAmount = Number(registrationEntry[REGISTRATION_COLUMNS.CASH]);

      try {
        const formattedSubmissionDate = Utilities.formatDate(
          submissionDate,
          Session.getScriptTimeZone(),
          DATE_FORMAT
        );

        // Generate QR code data
        const qrData = Utilities.base64EncodeWebSafe(
          JSON.stringify({
            id: sessionId,
            date: formattedSubmissionDate,
          })
        );

        const qrCodeImageName = `${firstName}_${lastName}_CheckInQR`;

        const qrCodeBlob = generateQRCodeGif(qrData, qrCodeImageName);

        // Replace placeholders in template
        template.firstName = firstName;
        template.lastName = lastName;
        template.phoneNumber = phoneNumber;
        template.numberOfAdultTickets = String(numberOfAdultTickets);
        template.numberOfChildTickets = String(numberOfChildTickets);
        template.totalTickets = String(
          numberOfAdultTickets + numberOfChildTickets
        );
        template.totalPrice = totalPrice.toFixed(2);
        template.rawETransferAmount = etransferAmount;
        template.rawCashAmount = cashAmount;
        template.etransferAmount = Number.isNaN(etransferAmount)
          ? '0.00'
          : etransferAmount.toFixed(2);
        template.cashAmount = Number.isNaN(cashAmount)
          ? '0.00'
          : cashAmount.toFixed(2);
        template.currency = getMetaData('CURRENCY', routeMetadata);
        template.submissionDate = formattedSubmissionDate;
        template.qrCodeImageUrl = `cid:${qrCodeImageName}`;

        const emailBody = template.evaluate().getContent();

        // Send email
        GmailApp.sendEmail(
          email,
          'Xác Nhận Thanh Toán / Payment Confirmation',
          '',
          {
            from: fromEmail,
            name: `Tết Việt ${eventYear}`,
            htmlBody: emailBody,
            replyTo: getMetaData('CONTACT_EMAIL', routeMetadata) || undefined,
            inlineImages: {
              [qrCodeImageName]: qrCodeBlob,
            },
            attachments: [qrCodeBlob],
          }
        );

        registrationEntry[REGISTRATION_COLUMNS.CONFIRMATION_2] =
          `Sent: ${Utilities.formatDate(
            new Date(),
            Session.getScriptTimeZone(),
            DATE_FORMAT
          )}`;

        result.successCount++;
      } catch (error) {
        registrationEntry[REGISTRATION_COLUMNS.CONFIRMATION_2] =
          `Failed: ${(error as Error).message}`;
        result.errors.push({
          row: result.totalProcessed + 4, // Adjust for header rows
          error: (error as Error).message,
        });

        result.failureCount++;
      }
    }

    sheet
      .getRange(
        5,
        REGISTRATION_COLUMNS.CONFIRMATION_2 + 1,
        dataValues.length,
        1
      )
      .setValues(
        dataValues.map((row) => [row[REGISTRATION_COLUMNS.CONFIRMATION_2]])
      );

    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * UI function to send confirmation emails with user prompt
 */
function sendInitialConfirmationEmailsUI(): void {
  const ui = SpreadsheetApp.getUi();

  const quota = MailApp.getRemainingDailyQuota();
  if (quota <= 0) {
    ui.alert(
      'Email Quota Exceeded',
      'You have reached your daily email sending limit. Please try again tomorrow.',
      ui.ButtonSet.OK
    );
    return;
  }

  // Confirm action
  const confirmResponse = ui.alert(
    'Confirm Sending Initial Confirmation Emails',
    `This will send up to ${quota} confirmation emails (bilingual: Vietnamese & English).\n\n` +
      'It will skip registrations that have already been sent successfully.\n\n' +
      'Do you want to continue?',
    ui.ButtonSet.YES_NO
  );

  if (confirmResponse !== ui.Button.YES) {
    return;
  }

  try {
    const result = sendInitialConfirmationEmails(quota);

    const message =
      `Sending Complete!\n\n` +
      `Total Processed: ${result.totalProcessed}\n` +
      `Successful: ${result.successCount}\n` +
      `Failed: ${result.failureCount}\n` +
      (result.errors.length > 0
        ? `Errors:\n${result.errors.map((e) => `Row ${e.row}: ${e.error}`).join('\n')}`
        : 'No errors encountered.');

    ui.alert('Results', message, ui.ButtonSet.OK);
  } catch (error) {
    ui.alert(
      'Error',
      `Failed to send emails: ${(error as Error).message}`,
      ui.ButtonSet.OK
    );
  }
}

/**
 * UI function to send final confirmation emails with QR codes with user prompt
 */
function sendFinalConfirmationEmailsUI(): void {
  const ui = SpreadsheetApp.getUi();

  const quota = MailApp.getRemainingDailyQuota();
  if (quota <= 0) {
    ui.alert(
      'Email Quota Exceeded',
      'You have reached your daily email sending limit. Please try again tomorrow.',
      ui.ButtonSet.OK
    );
    return;
  }

  // Confirm action
  const confirmResponse = ui.alert(
    'Confirm Sending Final Confirmation Emails with QR Codes',
    `This will send up to ${quota} final confirmation emails with check-in QR codes (bilingual: Vietnamese & English).\n\n` +
      'Only registrations with balance = 0 (fully paid) will receive emails.\n' +
      'It will skip registrations that have already been sent successfully.\n\n' +
      'Do you want to continue?',
    ui.ButtonSet.YES_NO
  );

  if (confirmResponse !== ui.Button.YES) {
    return;
  }

  try {
    const result = sendFinalConfirmationEmails(quota);

    const message =
      `Sending Complete!\n\n` +
      `Total Processed: ${result.totalProcessed}\n` +
      `Successful: ${result.successCount}\n` +
      `Failed: ${result.failureCount}\n` +
      (result.errors.length > 0
        ? `Errors:\n${result.errors.map((e) => `Row ${e.row}: ${e.error}`).join('\n')}`
        : 'No errors encountered.');

    ui.alert('Results', message, ui.ButtonSet.OK);
  } catch (error) {
    ui.alert(
      'Error',
      `Failed to send emails: ${(error as Error).message}`,
      ui.ButtonSet.OK
    );
  }
}

function getRegistrationDataFromQRPayload(payload: string): Pick<
  RegistrationData,
  | 'firstName'
  | 'lastName'
  | 'phoneNumber'
  | 'numberOfAdultTickets'
  | 'numberOfChildTickets'
> & {
  registrationDate: string;
  notes: string;
  sessionId: string;
  checkedIn: string | undefined;
} {
  const qrPayload = JSON.parse(
    Utilities.newBlob(Utilities.base64DecodeWebSafe(payload)).getDataAsString()
  );

  if (
    !('id' in qrPayload) ||
    !('date' in qrPayload) ||
    typeof qrPayload.id !== 'string' ||
    typeof qrPayload.date !== 'string'
  ) {
    throw new Error('code_1');
  }

  const data = getRegistrationData(qrPayload.id);

  if (!data) {
    throw new Error('code_2');
  }

  if (
    !isEqual(
      data?.registrationDate,
      Utilities.parseDate(
        qrPayload.date,
        Session.getScriptTimeZone(),
        DATE_FORMAT
      )
    )
  ) {
    throw new Error('code_3');
  }

  return {
    firstName: data.firstName,
    lastName: data.lastName,
    phoneNumber: data.phoneNumber,
    numberOfAdultTickets: data.numberOfAdultTickets,
    numberOfChildTickets: data.numberOfChildTickets,
    registrationDate: Utilities.formatDate(
      data.registrationDate,
      Session.getScriptTimeZone(),
      DATE_FORMAT
    ),
    notes: data.notes,
    sessionId: data.sessionId,
    checkedIn: data.checkedIn
      ? Utilities.formatDate(
          data.checkedIn,
          Session.getScriptTimeZone(),
          DATE_FORMAT
        )
      : undefined,
  };
}

function checkIn(sessionID: string): void {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error('code_1'); // Registrations sheet not found
  }

  // Acquire lock to prevent concurrent executions
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw new Error(
      'code_2' // Could not obtain lock for check-in
    );
  }

  try {
    const dataValues = sheet.getDataRange().getValues();

    for (let i = dataValues.length - 1; i > 3; i--) {
      if (dataValues[i][REGISTRATION_COLUMNS.SESSION_ID] === sessionID) {
        sheet
          .getRange(i + 1, REGISTRATION_COLUMNS.CHECKED_IN + 1)
          .setValue(
            Utilities.formatDate(
              new Date(),
              Session.getScriptTimeZone(),
              DATE_FORMAT
            )
          );
        return;
      }
    }

    throw new Error('code_3'); // Registration entry not found for check-in
  } catch (error) {
    throw error;
  } finally {
    lock.releaseLock();
  }
}

export {
  registerEntry,
  getTotalTicketStatus,
  getSanitizedRegistrationData as getRegistrationData,
  getRegistrationDataFromQRPayload,
  checkIn,
  sendInitialConfirmationEmails,
  sendInitialConfirmationEmailsUI,
  sendFinalConfirmationEmails,
  sendFinalConfirmationEmailsUI,
};

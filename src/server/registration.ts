import { RegistrationData } from '~/types/registration';
import { INTERNAL_METADATA } from './constants';
import { getManifest } from './webapp';
import type { meta } from '~/web/routes/registration/index.json';

const LOCK_TIMEOUT_MS = 5000 as const;
const SHEET_NAME = 'Registrations' as const;
const CONFIRMATION_INITIAL_TEMPLATE_FILE =
  'server/templates/registration-initial-confirm' as const;
const CONFIRMATION_FINAL_TEMPLATE_FILE =
  'server/templates/registration-final-confirm' as const;
const ROUTE_NAME = '/registration' as const;

const SUMMARY_COLUMNS = {
  TOTAL_TICKETS: 0,
  MAX_TOTAL_TICKETS: 1,
  REMAINING_TICKETS: 2,
  ADULT_TICKET_PRICE: 3,
  CHILD_TICKET_PRICE: 4,
} as const;

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
} as const;

const DATE_FORMAT = 'yyyy-MM-dd hh:mm:ss a' as const;

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
      getManifest()?.[ROUTE_NAME]?.meta?.[metaName]?.defaultValue ||
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
      ? ((formData as any).email?.trim() ?? '')
      : '';
  const trimmedAddress =
    trimmedConfirmationMethod === 'mail'
      ? ((formData as any).address?.trim() ?? '')
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
    Logger.log('Could not obtain lock for registration.');
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

      const range = sheet.getRange(1, 1, 5, 18);
      const firstRowPadding = new Array(13).fill('');
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
      ]);
    }
  } catch (error) {
    Logger.log('Error during registration: ' + (error as Error).message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function getRegistrationData(sessionID: string): RegistrationData | undefined {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);

  if (!sheet) {
    return undefined;
  }

  const dataValues = sheet.getDataRange().getValues();

  for (let i = dataValues.length - 1; i > 2; i--) {
    const row = dataValues[i];
    if (row[REGISTRATION_COLUMNS.SESSION_ID] === sessionID) {
      const registrationData: RegistrationData = {
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
      };
      return registrationData;
    }
  }

  return undefined;
}

interface MailMergeResult {
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ row: number; error: string }>;
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

  const fromEmail = (() => {
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
  })();

  // Acquire lock to prevent concurrent executions
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw new Error(
      'Could not obtain lock for sending emails. Please try again later.'
    );
  }

  try {
    for (let registrationEntry of dataValues) {
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

        const emailBody = template.evaluate().getContent();

        // Send email
        GmailApp.sendEmail(
          email,
          'Xác Nhận Đăng Ký / Registration Confirmation',
          emailBody,
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

export {
  registerEntry,
  getTotalTicketStatus,
  getRegistrationData,
  sendInitialConfirmationEmails,
  sendInitialConfirmationEmailsUI,
};

import { RegistrationData } from '~/types/registration';
import { INTERNAL_METADATA } from './constants';
import { getManifest } from './webapp';
import type { meta } from '~/web/routes/registration/index.json';

const LOCK_TIMEOUT_MS = 5000;
const SHEET_NAME = 'Registrations';
const CONFIRMATION_INITIAL_TEMPLATE_FILE =
  'server/templates/registration-initial-confirm';
const CONFIRMATION_FINAL_TEMPLATE_FILE =
  'server/templates/registration-final-confirm';
const ROUTE_NAME = '/registration';

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
    new Date(),
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
      for (let i = 4; i < dataValues.length; i++) {
        const row = dataValues[i];
        const existingPhone = String(row[4]);
        const existingEmail = String(row[6]);

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
      const range = sheet.getRange(1, 1, 4, 12);
      const firstRowPadding = ['', '', '', '', '', '', '', '', '', '', ''];
      range.setValues([
        ['Total Tickets', ...firstRowPadding],
        [
          [
            '=SUM(',
            'BYROW(',
            'FILTER({ARRAYFORMULA(VALUE(A4:A)), B4:B, I4:I + J4:J}, B4:B <> ""),',
            'LAMBDA(r,',
            'IF(',
            'INDEX(r,1,1) = MAX(FILTER(ARRAYFORMULA(VALUE(A4:A)), B4:B = INDEX(r,1,2))),',
            'INDEX(r,1,3),',
            '0',
            ')',
            ')',
            ')',
            ')',
          ].join(''),
          ...firstRowPadding,
        ],
        [
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
        payload,
      ]);
    } else {
      sheet.appendRow(payload);
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
    if (row[1] === sessionID) {
      const registrationData: RegistrationData = {
        firstName: String(row[2]),
        lastName: String(row[3]),
        phoneNumber: String(row[4]),
        confirmationMethod: String(row[5]) as 'email' | 'mail',
        email: String(row[6]),
        address: String(row[7]),
        numberOfAdultTickets: Number(row[8]),
        numberOfChildTickets: Number(row[9]),
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
  dataValues.splice(0, 3); // Skip header rows

  const template = HtmlService.createTemplateFromFile(
    CONFIRMATION_INITIAL_TEMPLATE_FILE
  );

  const routeMetadata = JSON.parse(
    PropertiesService.getScriptProperties().getProperty(
      INTERNAL_METADATA.ROUTE_METADATA
    ) || '{}'
  );

  const adultPrice = Number(getMetaData('TICKET_PRICE_ADULT', routeMetadata));
  const childPrice = Number(getMetaData('TICKET_PRICE_CHILD', routeMetadata));

  const result: MailMergeResult = {
    totalProcessed: 0,
    successCount: 0,
    failureCount: 0,
    errors: [],
  };

  // Acquire lock to prevent concurrent executions
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw new Error(
      'Could not obtain lock for sending emails. Please try again later.'
    );
  }

  try {
    // Start from row 4 (index 3) - skip header rows
    for (let registrationEntry of dataValues) {
      if (result.totalProcessed >= maxEmails) {
        break;
      }

      const confirmationStatus = String(registrationEntry[10] || '').trim(); // Column K (Confirmation 1)

      // Skip if already successfully sent
      if (
        confirmationStatus.toLowerCase().startsWith('sent:') ||
        confirmationStatus.toLowerCase().includes('success')
      ) {
        continue;
      }

      const confirmationMethod = String(registrationEntry[5]);
      const email = String(registrationEntry[6]);

      // Skip if no email address for email confirmation method
      if (confirmationMethod !== 'email' || !email) {
        continue;
      }

      result.totalProcessed++;

      const submissionDate = new Date(registrationEntry[0]);
      const firstName = String(registrationEntry[2]);
      const lastName = String(registrationEntry[3]);
      const phoneNumber = String(registrationEntry[4]);
      const numberOfAdultTickets = Number(registrationEntry[8]);
      const numberOfChildTickets = Number(registrationEntry[9]);
      const totalAdultPrice =
        numberOfAdultTickets * (Number.isNaN(adultPrice) ? 0 : adultPrice);
      const totalChildPrice =
        numberOfChildTickets * (Number.isNaN(childPrice) ? 0 : childPrice);
      const totalPrice = totalAdultPrice + totalChildPrice;

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
          'MMM dd, yyyy HH:mm:ss'
        );

        // Send email
        MailApp.sendEmail({
          to: email,
          subject: 'Xác Nhận Đăng Ký / Registration Confirmation',
          htmlBody: template.evaluate().getContent(),
        });

        registrationEntry[10] = `Sent: ${Utilities.formatDate(
          new Date(),
          Session.getScriptTimeZone(),
          'MMM dd, yyyy HH:mm:ss'
        )}`;

        result.successCount++;
      } catch (error) {
        registrationEntry[10] = `Failed: ${(error as Error).message}`;
        result.errors.push({
          row: result.totalProcessed + 4, // Adjust for header rows
          error: (error as Error).message,
        });

        result.failureCount++;
      }
    }

    sheet
      .getRange(4, 11, dataValues.length, 1)
      .setValues(dataValues.map((row) => [row[10]]));

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

import { RegistrationData } from '~/types/registration';

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
    throw new Error('Session ID is required for registration.');
  }

  if (!isValidRegistrationData(formData)) {
    throw new Error('Invalid form data provided for registration.');
  }

  const max = getMaxTotalTickets();
  const totalTickets =
    formData.numberOfAdultTickets +
    formData.numberOfChildTickets +
    (getCurrentTotalTickets() || 0);

  if (totalTickets > max) {
    throw new Error('Maximum number of tickets reached.');
  }

  const payload = [
    new Date(),
    `'${sessionID}`,
    `'${formData.firstName}`,
    `'${formData.lastName}`,
    `'${formData.phoneNumber}`,
    `'${formData.confirmationMethod}`,
    `'${(formData as any).email ?? ''}`,
    `'${(formData as any).address ?? ''}`,
    `${formData.numberOfAdultTickets}`,
    `${formData.numberOfChildTickets}`,
  ];

  const activeSpreadsheet = SpreadsheetApp.getActive();
  let sheet = activeSpreadsheet.getSheetByName('Registrations');

  const lock = LockService.getDocumentLock();
  if (lock.tryLock(5000)) {
    try {
      if (!sheet) {
        sheet = activeSpreadsheet.insertSheet('Registrations');
        const range = sheet.getRange(1, 1, 4, 10);
        const firstRowPadding = ['', '', '', '', '', '', '', '', ''];
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
  } else {
    Logger.log('Could not obtain lock for registration.');
    throw new Error('Could not obtain lock for registration.');
  }
}

function getCurrentTotalTickets(): number | undefined {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Registrations');

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

function getMaxTotalTickets(): number {
  return 10;
}

function getTotalTicketStatus(): {
  currentTotalTickets: number | undefined;
  maxTotalTickets: number;
} {
  return {
    currentTotalTickets: getCurrentTotalTickets(),
    maxTotalTickets: getMaxTotalTickets(),
  };
}

function getRegistrationData(sessionID: string): RegistrationData | undefined {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Registrations');

  if (!sheet) {
    return undefined;
  }

  const dataValues = sheet.getDataRange().getValues();

  for (let i = dataValues.length - 1; i > 3; i--) {
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

export {
  registerEntry,
  getCurrentTotalTickets,
  getMaxTotalTickets,
  getTotalTicketStatus,
  getRegistrationData
};

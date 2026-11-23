export type RegistrationData = {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  numberOfAdultTickets: number;
  numberOfChildTickets: number;
} & (
  | {
      confirmationMethod: 'mail';
      address?: string;
    }
  | {
      confirmationMethod: 'email';
      email?: string;
    }
);

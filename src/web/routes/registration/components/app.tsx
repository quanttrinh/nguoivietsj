import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  Match,
  Show,
  startTransition,
  Switch,
} from 'solid-js';
import { Portal } from 'solid-js/web';

import { makePersisted } from '@solid-primitives/storage';

import Loader from 'lucide-solid/icons/loader';
import CircleAlert from 'lucide-solid/icons/circle-alert';
import CircleCheckBig from 'lucide-solid/icons/circle-check-big';

import { callScript } from '~web/lib/googleapi';
import { getMeta, getNonce } from '~/web/common/meta';

import { ThemeSwitcher } from '~/web/common/components/theme-switcher';
import { Button } from '~/web/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/web/ui/card';
import { Label } from '~/web/ui/label';
import {
  NumberField,
  NumberFieldDecrementTrigger,
  NumberFieldErrorMessage,
  NumberFieldControl,
  NumberFieldIncrementTrigger,
  NumberFieldInput,
} from '~/web/ui/number-field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/web/ui/tabs';
import {
  TextField,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldTextArea,
} from '~/web/ui/text-field';
import { Separator } from '~/web/ui/separator';
import { Dialog } from '@ark-ui/solid/dialog';

import { TicketStatus } from './ticket-status';

import * as i18n from '@solid-primitives/i18n';
import * as enDict from '../locales/en.json';
import * as frDict from '../locales/fr.json';
import * as vnDict from '../locales/vn.json';
import { LocaleSwitcher } from '~/web/common/components/locale-switcher';

import type { RegistrationData } from '~/types/registration';

function RegistrationPage() {
  const componentId = crypto.randomUUID();

  /**
   * i18n setup
   */
  const [locale, setLocale] = createSignal<'en' | 'fr' | 'vn'>('vn');
  const dictionaries = {
    en: enDict,
    fr: frDict,
    vn: vnDict,
  };
  const dict = createMemo(() => i18n.flatten(dictionaries[locale()]));
  const translator = i18n.translator(dict, i18n.resolveTemplate);

  /**
   * Form state management
   */
  const [formState, setFormState] = createSignal<
    'idle' | 'submitting' | 'submitted' | 'error' | 'loading' | 'viewOnly'
  >('loading');

  const [submissionErrorMsg, setSubmissionErrorMsg] = createSignal<
    string | undefined
  >(undefined);

  const shouldDisableForm = createMemo(() => {
    return (
      formState() === 'loading' ||
      formState() === 'submitted' ||
      formState() === 'submitting' ||
      formState() === 'viewOnly'
    );
  });

  /**
   * Check if registration is already completed
   */
  const [registeredSessionId] = createResource(document.cookie, () => {
    const match = document.cookie.match(
      /registeredSessionId=(?<sessionId>[^;]+?)(?:;|$)/mv
    )?.groups?.sessionId;

    if (!match) {
      setFormState('idle');
    }

    return match;
  });

  createEffect(async () => {
    if (registeredSessionId()) {
      setFormState('loading');
      await startTransition(async () => {
        const registeredData = await callScript(
          'getRegistrationData',
          null,
          registeredSessionId() || ''
        );
        if (registeredData) {
          setFormData({
            firstName: registeredData.firstName,
            lastName: registeredData.lastName,
            phoneNumber: registeredData.phoneNumber,
            numberOfAdultTickets: registeredData.numberOfAdultTickets,
            numberOfChildrenTickets: registeredData.numberOfChildTickets,
            email: (registeredData as any).email,
            address: (registeredData as any).address,
            confirmationMethod: registeredData.confirmationMethod,
          });
          setFormState('viewOnly');
        } else {
          document.cookie = `registeredSessionId=; max-age=0`;
          setFormState('idle');
        }
      });
    }
  });

  /**
   * Ticket status visibility
   */
  const [ticketStatusVisible, setTicketStatusVisible] = createSignal(true);
  const [ticketStatusHeight, setTicketStatusHeight] = createSignal(0);

  // Track scroll and control visibility
  createEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // Show/hide based on scroll position
      // Show ticket status when scrolled near the top
      if (currentScrollY < ticketStatusHeight() * 0.2) {
        setTicketStatusVisible(true);
      }
      // Hide ticket status when scrolled past it
      else {
        setTicketStatusVisible(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  });

  /**
   * Main logic
   */
  const [formData, setFormData] = makePersisted(
    createSignal<{
      firstName: string;
      lastName: string;
      phoneNumber: string;
      numberOfAdultTickets: number | undefined;
      numberOfChildrenTickets: number | undefined;
      email: string | undefined;
      address: string | undefined;
      confirmationMethod?: 'email' | 'mail';
    }>({
      firstName: '',
      lastName: '',
      phoneNumber: '',
      numberOfAdultTickets: 1,
      numberOfChildrenTickets: 0,
      email: '',
      address: '',
      confirmationMethod: 'email',
    }),
    { storage: sessionStorage, name: 'registration-form-data' }
  );

  const [errors, setErrors] = createSignal<{
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    numberOfAdultTickets?: string;
    numberOfChildrenTickets?: string;
    email?: string;
    address?: string;
  }>({});

  const nameRegex = /^[\p{L} '-]+$/u;
  const phoneNumberRegex =
    /^(?:\+?(?<country>\d{1,3}))?[-. ]*\(?(?<area>\d{3})\)?[-. ]*(?<local1>\d{3})[-. ]*(?<local2>\d{4})(?: *x(?<ext>\d{1,5}))?$/u;

  createEffect(() => {
    const value = formData().firstName.trim();
    if (!value) {
      setErrors((prev) => ({
        ...prev,
        firstName: translator('text_field_required', {
          field: translator('first_name.label'),
        }),
      }));

      return;
    }

    if (!nameRegex.test(value)) {
      setErrors((prev) => ({
        ...prev,
        firstName: translator('text_field_invalid', {
          field: translator('first_name.label'),
        }),
      }));

      return;
    }

    setErrors((prev) => ({
      ...prev,
      firstName: undefined,
    }));
  });

  createEffect(() => {
    const value = formData().lastName.trim();
    if (!value) {
      setErrors((prev) => ({
        ...prev,
        lastName: translator('text_field_required', {
          field: translator('last_name.label'),
        }),
      }));

      return;
    }

    if (!nameRegex.test(value)) {
      setErrors((prev) => ({
        ...prev,
        lastName: translator('text_field_invalid', {
          field: translator('last_name.label'),
        }),
      }));

      return;
    }

    setErrors((prev) => ({
      ...prev,
      lastName: undefined,
    }));
  });

  createEffect(() => {
    const totalTickets =
      (formData().numberOfAdultTickets || 0) +
      (formData().numberOfChildrenTickets || 0);
    (['numberOfAdultTickets', 'numberOfChildrenTickets'] as const).forEach(
      (field) => {
        const value = formData()[field];

        if (totalTickets <= 0) {
          setErrors((prev) => ({
            ...prev,
            [field]: translator('total_tickets_too_low'),
          }));

          return;
        }

        if (value === undefined || isNaN(value) || value < 0) {
          setErrors((prev) => ({
            ...prev,
            [field]: translator('number_field_required', {
              field: translator(
                field === 'numberOfAdultTickets'
                  ? 'adult_tickets.label'
                  : 'children_tickets.label'
              ),
            }),
          }));

          return;
        }

        setErrors((prev) => ({
          ...prev,
          [field]: undefined,
        }));
      }
    );
  });

  createEffect(() => {
    switch (formData().confirmationMethod) {
      case 'email': {
        setErrors((prev) => ({
          ...prev,
          address: undefined,
        }));

        const email = formData().email?.trim() || '';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (email === '') {
          setErrors((prev) => ({
            ...prev,
            email: translator('text_field_required', {
              field: translator('email.label'),
            }),
          }));

          return;
        } else if (!emailRegex.test(email)) {
          setErrors((prev) => ({
            ...prev,
            email: translator('email_field_invalid'),
          }));

          return;
        }

        setErrors((prev) => ({
          ...prev,
          email: undefined,
        }));

        break;
      }

      case 'mail': {
        setErrors((prev) => ({
          ...prev,
          email: undefined,
        }));

        const address = formData().address?.trim() || '';
        if (address === '') {
          setErrors((prev) => ({
            ...prev,
            address: translator('text_field_required', {
              field: translator('mail.label'),
            }),
          }));

          return;
        }

        setErrors((prev) => ({
          ...prev,
          address: undefined,
        }));

        break;
      }
    }
  });

  createEffect(() => {
    const phoneNumber = formData().phoneNumber.trim();
    if (!phoneNumber) {
      setErrors((prev) => ({
        ...prev,
        phoneNumber: translator('text_field_required', {
          field: translator('phone_number.label'),
        }),
      }));
      return;
    }

    if (!phoneNumberRegex.test(phoneNumber)) {
      setErrors((prev) => ({
        ...prev,
        phoneNumber: translator('phone_field_invalid'),
      }));
      return;
    }

    setErrors((prev) => ({
      ...prev,
      phoneNumber: undefined,
    }));
  });

  const ADULT_TICKET_PRICE = parseFloat(getMeta('TICKET_PRICE_ADULT') || '0');
  const CHILD_TICKET_PRICE = parseFloat(getMeta('TICKET_PRICE_CHILD') || '0');
  const MAX_ADULT_TICKETS_PER_REGISTRATION = parseInt(
    getMeta('MAX_ADULT_TICKETS_PER_REGISTRATION') || '4',
    10
  );
  const MAX_CHILD_TICKETS_PER_REGISTRATION = parseInt(
    getMeta('MAX_CHILD_TICKETS_PER_REGISTRATION') || '6',
    10
  );

  const getTotalPrice = createMemo(() => {
    const { numberOfAdultTickets, numberOfChildrenTickets } = formData();
    const totalPrice =
      ADULT_TICKET_PRICE * (numberOfAdultTickets || 0) +
      CHILD_TICKET_PRICE * (numberOfChildrenTickets || 0);
    return totalPrice;
  });

  const processNumberInput = (
    value: number | undefined,
    lower: number,
    upper: number
  ): number | undefined => {
    if (value === undefined || isNaN(value)) {
      return undefined;
    }

    return Math.max(lower, Math.min(value, upper));
  };

  return (
    <Show
      when={!registeredSessionId.loading && formState() !== 'loading'}
      fallback={
        <div class='size-full place-items-center-safe place-content-center-safe'>
          <Loader class='animate-spin w-8 h-8' />
          <div class='absolute bottom-4 right-4'>
            <ThemeSwitcher />
          </div>
        </div>
      }
    >
      <Dialog.Root open={formState() !== 'idle' && formState() !== 'viewOnly'}>
        <Portal>
          <Dialog.Backdrop class='fixed inset-0 z-50 bg-black/10 dark:bg-black/80 backdrop-blur-xs' />
          <Dialog.Positioner class='fixed inset-0 z-50 flex items-center justify-center p-4'>
            <Dialog.Content class='relative w-full max-w-sm bg-transparent p-5'>
              <Switch>
                <Match when={formState() === 'submitted'}>
                  <div class='flex flex-col gap-4'>
                    <h2 class='flex gap-2 text-xl font-bold text-success'>
                      <CircleCheckBig />
                      {translator('blocking_dialog.submission_success_title')}
                    </h2>
                    <p>
                      {translator('blocking_dialog.submission_success_message')}
                    </p>
                  </div>
                </Match>
                <Match when={formState() === 'submitting'}>
                  <div class='flex flex-col gap-4 items-center'>
                    <Loader class='animate-spin w-8 h-8' />
                    <p>
                      {translator('blocking_dialog.submission_in_progress')}
                    </p>
                  </div>
                </Match>
                <Match when={formState() === 'error'}>
                  <div class='flex flex-col gap-4'>
                    <h2 class='flex gap-2 text-xl font-bold text-error'>
                      <CircleAlert />
                      {translator('blocking_dialog.submission_error_title')}
                    </h2>
                    <p>
                      {translator('blocking_dialog.submission_error_message')}
                    </p>
                    <p class='text-error'>{submissionErrorMsg()}</p>
                    <Button
                      onClick={() => {
                        setFormState('idle');
                        setSubmissionErrorMsg(undefined);
                      }}
                    >
                      {translator('blocking_dialog.submission_error_retry')}
                    </Button>
                  </div>
                </Match>
              </Switch>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
      <TicketStatus
        visible={ticketStatusVisible()}
        noTicketsText={translator('ticket_status.no_tickets_message')}
        ticketStatusText={translator('ticket_status.status_message')}
        onHeightChange={setTicketStatusHeight}
      />
      <div
        nonce={getNonce()}
        class='flex w-full place-items-center-safe transition-all duration-300'
        style={{
          'min-height': `calc(100vh - ${ticketStatusHeight()}px)`,
        }}
      >
        <div class='flex flex-col gap-4 max-w-4xl mx-auto p-2 md:p-4 w-full'>
          <Card>
            <CardHeader>
              <div class='flex gap-2'>
                <div class='flex-grow flex flex-col gap-2'>
                  <CardTitle>{translator('form.title')}</CardTitle>
                  <CardDescription>
                    {translator('form.description')}
                  </CardDescription>
                </div>
                <div class='flex items-start'>
                  <LocaleSwitcher
                    locales={[
                      { code: 'vn', label: 'Tiếng Việt' },
                      { code: 'en', label: 'English' },
                      { code: 'fr', label: 'Français' },
                    ]}
                    onLocaleChange={(locale) => {
                      setLocale(locale);
                    }}
                  />
                  <ThemeSwitcher />
                </div>
              </div>
            </CardHeader>
            <CardContent class='flex flex-col gap-4'>
              <div>
                <h3 class='text-lg font-medium'>
                  {translator('personal_info.title')}
                </h3>
                <p class='text-sm text-muted-foreground'>
                  {translator('personal_info.description')}
                </p>
              </div>
              <div class='grid grid-cols-2 gap-y-1 gap-x-4'>
                <Label
                  for={`${componentId}-firstName`}
                  class='order-1'
                >
                  {translator('first_name.label')}
                </Label>
                <TextField
                  class='order-3'
                  disabled={shouldDisableForm()}
                  invalid={!!errors().firstName}
                >
                  <TextFieldInput
                    id={`${componentId}-firstName`}
                    name='firstName'
                    placeholder={translator('first_name.placeholder')}
                    class='w-full'
                    type='text'
                    value={formData().firstName}
                    onInput={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        firstName: e.currentTarget.value,
                      }));
                    }}
                  />
                  <TextFieldErrorMessage>
                    {errors().firstName}
                  </TextFieldErrorMessage>
                </TextField>
                <Label
                  for={`${componentId}-lastName`}
                  class='order-2'
                >
                  {translator('last_name.label')}
                </Label>
                <TextField
                  class='order-4'
                  disabled={shouldDisableForm()}
                  invalid={!!errors().lastName}
                >
                  <TextFieldInput
                    id={`${componentId}-lastName`}
                    name='lastName'
                    placeholder={translator('last_name.placeholder')}
                    class='w-full'
                    type='text'
                    value={formData().lastName}
                    onInput={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        lastName: e.currentTarget.value,
                      }));
                    }}
                  />
                  <TextFieldErrorMessage>
                    {errors().lastName}
                  </TextFieldErrorMessage>
                </TextField>
              </div>
              <div class='flex flex-col gap-1'>
                <Label for={`${componentId}-phoneNumber`}>
                  {translator('phone_number.label')}
                </Label>
                <TextField
                  disabled={shouldDisableForm()}
                  invalid={!!errors().phoneNumber}
                >
                  <TextFieldInput
                    id={`${componentId}-phoneNumber`}
                    name='phoneNumber'
                    placeholder={translator('phone_number.placeholder')}
                    class='w-full'
                    type='tel'
                    value={formData().phoneNumber}
                    onInput={(e) => {
                      if (/[^\d\-\+\(\)x ]/.test(e.currentTarget.value)) {
                        e.preventDefault();
                        e.currentTarget.value = e.currentTarget.value.slice(
                          0,
                          -1
                        );
                        return;
                      }
                      setFormData((prev) => ({
                        ...prev,
                        phoneNumber: e.currentTarget.value,
                      }));
                    }}
                    onBlur={(e) => {
                      if (errors().phoneNumber) {
                        return;
                      }

                      const match = phoneNumberRegex.exec(
                        formData().phoneNumber.trim()
                      );

                      if (match && match.groups) {
                        const formattedNumber = `+${match.groups.country || '1'} (${match.groups.area}) ${match.groups.local1}-${match.groups.local2}${
                          match.groups.ext ? ' x' + match.groups.ext : ''
                        }`;
                        setFormData((prev) => ({
                          ...prev,
                          phoneNumber: formattedNumber,
                        }));
                        e.currentTarget.value = formattedNumber;
                      }
                    }}
                  />
                  <TextFieldErrorMessage>
                    {errors().phoneNumber}
                  </TextFieldErrorMessage>
                </TextField>
              </div>
              <div>
                <h3 class='text-lg font-medium'>
                  {translator('ticket_selection.title')}
                </h3>
                <p class='text-sm text-muted-foreground'>
                  {translator('ticket_selection.description')}
                </p>
              </div>
              <div class='grid grid-cols-2 gap-y-1 gap-x-4'>
                <Label
                  for={`${componentId}-numberOfAdultTickets`}
                  class='order-1'
                >
                  {translator('adult_tickets.label')}
                </Label>
                <NumberField
                  min={0}
                  max={MAX_ADULT_TICKETS_PER_REGISTRATION}
                  step={1}
                  value={formData().numberOfAdultTickets?.toString() ?? ''}
                  onValueChange={(details) => {
                    const newValue = processNumberInput(
                      parseInt(details.value, 10),
                      0,
                      MAX_ADULT_TICKETS_PER_REGISTRATION
                    );
                    setFormData((prev) => ({
                      ...prev,
                      numberOfAdultTickets: newValue,
                    }));
                    (
                      document.getElementById(
                        `${componentId}-numberOfAdultTickets`
                      ) as HTMLInputElement
                    ).value = newValue?.toString() || '';
                  }}
                  class='order-3'
                  disabled={shouldDisableForm()}
                  invalid={!!errors().numberOfAdultTickets}
                >
                  <NumberFieldControl>
                    <NumberFieldInput
                      id={`${componentId}-numberOfAdultTickets`}
                      name='numberOfAdultTickets'
                      placeholder={translator('adult_tickets.placeholder')}
                    />
                    <NumberFieldIncrementTrigger
                      disabled={
                        (formData().numberOfAdultTickets || 0) >= 100 ||
                        shouldDisableForm()
                      }
                    />
                    <NumberFieldDecrementTrigger
                      disabled={
                        (formData().numberOfAdultTickets || 0) <= 0 ||
                        shouldDisableForm()
                      }
                    />
                  </NumberFieldControl>
                  <NumberFieldErrorMessage>
                    {errors().numberOfAdultTickets}
                  </NumberFieldErrorMessage>
                </NumberField>
                <Label
                  for={`${componentId}-numberOfChildrenTickets`}
                  class='order-2'
                >
                  {translator('children_tickets.label')}
                </Label>
                <NumberField
                  min={0}
                  max={MAX_CHILD_TICKETS_PER_REGISTRATION}
                  step={1}
                  value={formData().numberOfChildrenTickets?.toString() ?? ''}
                  onValueChange={(details) => {
                    const newValue = processNumberInput(
                      parseInt(details.value, 10),
                      0,
                      MAX_CHILD_TICKETS_PER_REGISTRATION
                    );
                    setFormData((prev) => ({
                      ...prev,
                      numberOfChildrenTickets: newValue,
                    }));
                    (
                      document.getElementById(
                        `${componentId}-numberOfChildrenTickets`
                      ) as HTMLInputElement
                    ).value = newValue?.toString() || '';
                  }}
                  class='order-4'
                  disabled={shouldDisableForm()}
                  invalid={!!errors().numberOfChildrenTickets}
                >
                  <NumberFieldControl>
                    <NumberFieldInput
                      id={`${componentId}-numberOfChildrenTickets`}
                      name='numberOfChildrenTickets'
                      placeholder={translator('children_tickets.placeholder')}
                    />
                    <NumberFieldIncrementTrigger
                      disabled={
                        (formData().numberOfChildrenTickets || 0) >= 100 ||
                        shouldDisableForm()
                      }
                    />
                    <NumberFieldDecrementTrigger
                      disabled={
                        (formData().numberOfChildrenTickets || 0) <= 0 ||
                        shouldDisableForm()
                      }
                    />
                  </NumberFieldControl>
                  <NumberFieldErrorMessage>
                    {errors().numberOfChildrenTickets}
                  </NumberFieldErrorMessage>
                </NumberField>
              </div>
              <div>
                <h3 class='text-lg font-medium'>
                  {translator('confirmation.title')}
                </h3>
                <p class='text-sm text-muted-foreground'>
                  {translator('confirmation.description')}
                </p>
              </div>
              <div class='flex flex-col gap-1'>
                <p class='text-sm font-medium leading-none'>
                  {translator('confirmation.method_question')}
                </p>
                <Tabs
                  value={formData().confirmationMethod || 'email'}
                  onValueChange={(details) => {
                    setFormData((prev) => ({
                      ...prev,
                      confirmationMethod: details.value as 'email' | 'mail',
                    }));
                  }}
                >
                  <TabsList class='grid w-full grid-cols-2'>
                    <TabsTrigger
                      name='confirmationMethod'
                      value='email'
                      disabled={shouldDisableForm()}
                    >
                      {translator('email.label')}
                    </TabsTrigger>
                    <TabsTrigger
                      name='confirmationMethod'
                      value='mail'
                      disabled={shouldDisableForm()}
                    >
                      {translator('mail.label')}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value='email'>
                    <div>
                      <TextField
                        disabled={shouldDisableForm()}
                        invalid={!!errors().email}
                      >
                        <TextFieldInput
                          id={`${componentId}-email`}
                          name='email'
                          placeholder={translator('email.placeholder')}
                          class='w-full'
                          type='email'
                          autocomplete='email'
                          value={formData().email || ''}
                          onInput={(e) => {
                            setFormData((prev) => ({
                              ...prev,
                              email: e.currentTarget.value,
                            }));
                          }}
                        />
                        <TextFieldErrorMessage>
                          {errors().email}
                        </TextFieldErrorMessage>
                      </TextField>
                    </div>
                  </TabsContent>
                  <TabsContent value='mail'>
                    <div>
                      <TextField
                        disabled={shouldDisableForm()}
                        invalid={!!errors().address}
                      >
                        <TextFieldTextArea
                          id={`${componentId}-address`}
                          name='address'
                          placeholder={translator('mail.placeholder')}
                          class='w-full'
                          autocomplete='street-address'
                          value={formData().address || ''}
                          onInput={(e) => {
                            setFormData((prev) => ({
                              ...prev,
                              address: e.currentTarget.value,
                            }));
                          }}
                        />
                        <TextFieldErrorMessage>
                          {errors().address}
                        </TextFieldErrorMessage>
                      </TextField>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
              <div>
                <h3 class='text-lg font-medium'>
                  {translator('payment.title')}
                </h3>
                <p class='text-sm text-muted-foreground'>
                  {translator('payment.description')}
                </p>
              </div>
              <div class='flex flex-col gap-1'>
                <p class='text-sm font-medium leading-none'>
                  {translator('payment.method_question')}
                </p>
                <Tabs defaultValue='etransfer'>
                  <TabsList class='grid w-full grid-cols-2'>
                    <TabsTrigger value='etransfer'>
                      {translator('payment.etransfer.label')}
                    </TabsTrigger>
                    <TabsTrigger value='inperson'>
                      {translator('payment.inperson.label')}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value='etransfer'>
                    <div class='flex flex-col'>
                      <span>
                        {translator('payment.etransfer.instructions', {
                          amount: getTotalPrice(),
                          currency: getMeta('CURRENCY') as string,
                        })}
                      </span>
                      <ul class='list-disc list-inside'>
                        <li>
                          <a href={`mailto:${getMeta('ETRANSFER_EMAIL')}`}>
                            {' '}
                            {getMeta('ETRANSFER_EMAIL')}
                          </a>
                        </li>
                      </ul>
                    </div>
                  </TabsContent>
                  <TabsContent value='inperson'>
                    <div class='flex flex-col'>
                      <span>
                        {translator('payment.inperson.instructions', {
                          amount: getTotalPrice(),
                          currency: getMeta('CURRENCY') as string,
                        })}
                      </span>
                      <ul class='list-disc list-inside'>
                        <li>
                          <a href={getMeta('CASH_ADDRESS_MAP_URL') as string}>
                            {getMeta('CASH_ADDRESS')}
                          </a>
                        </li>
                      </ul>
                      <iframe
                        src={getMeta('CASH_ADDRESS_MAP_EMBED_URL') as string}
                        nonce={getNonce()}
                        width='100%'
                        height='450'
                        class='border-none rounded-md'
                        allowfullscreen
                        loading='lazy'
                        referrerpolicy='no-referrer-when-downgrade'
                      ></iframe>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
              <Separator />
              <div>
                <h3 class='text-lg font-medium'>
                  {translator('contact_us.title')}
                </h3>
                <p class='text-sm text-muted-foreground'>
                  {translator('contact_us.description')}
                </p>
              </div>
              <div>
                <ul class='list-disc list-inside'>
                  <li>
                    <span>{translator('contact_us.email')} </span>
                    <a href={`mailto:${getMeta('CONTACT_EMAIL')}`}>
                      {getMeta('CONTACT_EMAIL')}
                    </a>
                  </li>
                  <li>
                    <span>{translator('contact_us.phone')} </span>
                    <a href={`tel:${getMeta('CONTACT_PHONE')}`}>
                      {getMeta('CONTACT_PHONE')}
                    </a>
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
          <div class='flex gap-4 flex-col-reverse md:flex-row'>
            <div class='flex flex-grow gap-4 justify-center md:justify-start'>
              <div class='place-content-center-safe'>
                <p>{translator('made_with_love', { name: 'Q.Trinh' })}</p>
              </div>
            </div>
            <div class='flex flex-grow gap-4 justify-center md:justify-end'>
              <div class='place-content-center-safe'>
                <p>
                  <b>{translator('total')}</b>
                  <span>
                    {' '}
                    {getTotalPrice()} {getMeta('CURRENCY')}
                  </span>
                </p>
              </div>
              <div>
                <Separator
                  orientation='vertical'
                  class='bg-foreground w-px'
                />
              </div>
              <Button
                type='submit'
                disabled={
                  shouldDisableForm() ||
                  Object.values(errors()).some((field) => !!field)
                }
                onClick={async () => {
                  try {
                    setFormState('submitting');
                    setSubmissionErrorMsg(undefined);

                    const fd = formData();

                    // Build payload to match RegistrationData shape
                    let payload: RegistrationData;
                    if (fd.confirmationMethod === 'mail') {
                      payload = {
                        firstName: fd.firstName,
                        lastName: fd.lastName,
                        phoneNumber: fd.phoneNumber,
                        numberOfAdultTickets: fd.numberOfAdultTickets ?? 0,
                        numberOfChildTickets: fd.numberOfChildrenTickets ?? 0,
                        confirmationMethod: 'mail',
                        address: fd.address ?? '',
                      };
                    } else {
                      payload = {
                        firstName: fd.firstName,
                        lastName: fd.lastName,
                        phoneNumber: fd.phoneNumber,
                        numberOfAdultTickets: fd.numberOfAdultTickets ?? 0,
                        numberOfChildTickets: fd.numberOfChildrenTickets ?? 0,
                        confirmationMethod: 'email',
                        email: fd.email ?? '',
                      };
                    }

                    const sessionId =
                      registeredSessionId() || getMeta('SESSION_ID') || '';

                    await callScript('registerEntry', null, payload, sessionId);

                    document.cookie = `registeredSessionId=${sessionId}; expires=${new Date(
                      Date.now() + 7_776_000_000 // 90 days
                    ).toUTCString()}; SameSite=None; Secure;`;

                    setFormState('submitted');
                  } catch (error) {
                    setFormState('error');
                    switch ((error as Error)?.message.substring(5)) {
                      case '2':
                        setSubmissionErrorMsg(
                          translator(
                            'blocking_dialog.submission_error_duplicate_message'
                          )
                        );
                        break;
                      case '3':
                        setSubmissionErrorMsg(
                          translator(
                            'blocking_dialog.submission_error_capacity_message'
                          )
                        );
                        break;
                      default:
                        setSubmissionErrorMsg(
                          translator(
                            'blocking_dialog.submission_error_generic_message'
                          )
                        );
                    }
                  }
                }}
              >
                <Switch fallback={translator('submit_button.idle')}>
                  <Match when={formState() === 'submitting'}>
                    <div class='flex gap-2'>
                      <Loader class='animate-spin' />
                      <span>{translator('submit_button.submitting')}</span>
                    </div>
                  </Match>
                  <Match
                    when={
                      formState() === 'submitted' || formState() === 'viewOnly'
                    }
                  >
                    <span>{translator('submit_button.submitted')}</span>
                  </Match>
                </Switch>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}

export { RegistrationPage };

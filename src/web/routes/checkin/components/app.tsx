import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  Show,
  startTransition,
  Switch,
} from 'solid-js';

import { CameraOff, Loader, Settings, TicketCheck } from 'lucide-solid';

import { ThemeSwitcher } from '~/web/common/components/theme-switcher';
import { LocaleSwitcher } from '~/web/common/components/locale-switcher';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/web/ui/card';
import { Button } from '~/web/ui/button';
import { Dialog } from './dialog';

import { callScript } from '~/web/lib/googleapi';
import { useQRScanner } from '../utils/qr-scanner';

import * as i18n from '@solid-primitives/i18n';
import * as enDict from '../locales/en.json';
import * as frDict from '../locales/fr.json';
import * as vnDict from '../locales/vn.json';

import type { getRegistrationDataFromQRPayload } from '~/server/registration';

function CheckInPage() {
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

  const [state, setState] = createSignal<
    'idle' | 'loading' | 'checkedIn' | 'checkingIn' | 'error'
  >('idle');

  let videoEl: HTMLVideoElement | undefined;
  let overlayEl: HTMLCanvasElement | undefined;

  const [registrationData, setRegistrationData] = createSignal<ReturnType<
    typeof getRegistrationDataFromQRPayload
  > | null>(null);
  const [queryError, setQueryError] = createSignal<string | null>(null);
  const [checkInError, setCheckInError] = createSignal<string | null>(null);

  const { start, stop, isRunning } = useQRScanner({
    videoEl: () => videoEl,
    overlayEl: () => overlayEl,
    onDetected: (result) => {
      setState('loading');
      stop();
      setQueryError(null);
      startTransition(async () => {
        try {
          const data = await callScript(
            'getRegistrationDataFromQRPayload',
            null,
            result
          );

          setRegistrationData(data);
          setState('checkingIn');
        } catch (error) {
          setRegistrationData(null);
          setQueryError(error instanceof Error ? error.message : String(error));
          setState('error');
        }
      });
    },
  });

  createEffect(() => {
    if (state() === 'checkedIn') {
      setTimeout(() => {
        setState('idle');
        start();
      }, 2500);
    }
  });

  return (
    <>
      <Dialog open={state() === 'checkingIn'}>
        <div class='flex flex-col gap-4'>
          <h2 class='text-lg font-semibold'>
            {translator('attendee_info.title')}
          </h2>
          <div>
            <p>
              <strong>{translator('attendee_info.first_name')}:</strong>{' '}
              {registrationData()?.firstName}
            </p>
            <p>
              <strong>{translator('attendee_info.last_name')}:</strong>{' '}
              {registrationData()?.lastName}
            </p>
            <p>
              <strong>{translator('attendee_info.adult_tickets')}:</strong>{' '}
              {registrationData()?.numberOfAdultTickets}
            </p>
            <p>
              <strong>{translator('attendee_info.child_tickets')}:</strong>{' '}
              {registrationData()?.numberOfChildTickets}
            </p>
            <p>
              <strong>{translator('attendee_info.registration_date')}:</strong>{' '}
              {registrationData()?.registrationDate}{' '}
            </p>
            <Show when={registrationData()?.checkedIn}>
              <p>
                <strong>{translator('attendee_info.checked_in_date')}:</strong>{' '}
                {registrationData()?.checkedIn}
              </p>
            </Show>
            <Show when={registrationData()?.notes}>
              <p>
                <strong>{translator('attendee_info.notes')}:</strong>{' '}
                {registrationData()?.notes}
              </p>
            </Show>
          </div>
          <div class='grid grid-cols-2 gap-2'>
            <Button
              onClick={() => {
                setRegistrationData(null);
                start();
                setState('idle');
              }}
            >
              {translator('dialog_buttons.close')}
            </Button>
            <Button
              disabled={!!registrationData()?.checkedIn}
              onClick={() => {
                setState('loading');
                setCheckInError(null);
                startTransition(async () => {
                  try {
                    await callScript(
                      'checkIn',
                      null,
                      registrationData()?.sessionId!
                    );
                    setState('checkedIn');
                  } catch (error) {
                    setCheckInError(
                      error instanceof Error ? error.message : String(error)
                    );
                    setState('error');
                    return;
                  }
                });
              }}
            >
              {registrationData()?.checkedIn
                ? translator('dialog_buttons.already_checked_in')
                : translator('dialog_buttons.checkin')}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog open={state() === 'error'}>
        <Switch
          fallback={
            <div class='flex flex-col gap-4'>
              <h2 class='text-lg font-semibold'>
                {translator('errors.unknown_error')}
              </h2>
              <div class='grid grid-cols-2 gap-2'>
                <Button
                  onClick={() => {
                    setState('idle');
                  }}
                >
                  {translator('dialog_buttons.close')}
                </Button>{' '}
              </div>
            </div>
          }
        >
          <Match when={queryError()}>
            <div class='flex flex-col gap-4'>
              <h2 class='text-lg font-semibold'>
                {translator('errors.query_error')}
              </h2>
              <div class='grid grid-cols-2 gap-2'>
                <Button
                  onClick={() => {
                    setQueryError(null);
                    setState('idle');
                  }}
                >
                  {translator('dialog_buttons.close')}
                </Button>
                <Button
                  onClick={() => {
                    setQueryError(null);
                    setState('idle');
                  }}
                >
                  {translator('dialog_buttons.retry')}
                </Button>
              </div>
            </div>
          </Match>
          <Match when={checkInError()}>
            <div class='flex flex-col gap-4'>
              <h2 class='text-lg font-semibold'>
                {translator('errors.check_in_failed')}
              </h2>
              <div class='grid grid-cols-2 gap-2'>
                <Button
                  onClick={() => {
                    setCheckInError(null);
                    setState('idle');
                  }}
                >
                  {translator('dialog_buttons.close')}
                </Button>
                <Button
                  onClick={() => {
                    setCheckInError(null);
                    setState('checkingIn');
                  }}
                >
                  {translator('dialog_buttons.retry')}
                </Button>
              </div>
            </div>
          </Match>
        </Switch>
      </Dialog>
      <Dialog open={state() === 'loading'}>
        <Loader class='animate-spin h-8 w-8 text-primary mx-auto' />
      </Dialog>
      <Dialog open={state() === 'checkedIn'}>
        <h2 class='text-lg font-semibold text-green-600 dark:text-green-400 mx-auto mb-2'>
          {translator('messages.check_in_successful')}
        </h2>
        <TicketCheck class='h-16 w-16 text-green-600 dark:text-green-400 mx-auto' />
      </Dialog>
      <div class='w-full min-h-screen flex items-center justify-center p-4 bg-background'>
        <div class='flex flex-col gap-4 max-w-2xl w-full'>
          <Card class='flex flex-col'>
            <CardHeader class='flex-shrink-0'>
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
              <div class='w-full'>
                <div class='relative w-full aspect-square overflow-hidden rounded-md border bg-muted'>
                  <video
                    ref={(el) => {
                      videoEl = el;
                    }}
                    autoplay
                    muted
                    playsinline
                    class='absolute inset-0 h-full w-full object-cover'
                    classList={{ hidden: !isRunning() }}
                  />
                  <canvas
                    ref={(el) => {
                      overlayEl = el;
                    }}
                    class='absolute inset-0 h-full w-full'
                    classList={{ hidden: !isRunning() }}
                  />
                  <Show when={!isRunning()}>
                    <CameraOff class='h-full w-full p-[30%]' />
                  </Show>
                </div>

                <div class='mt-3 flex items-center gap-2'>
                  <Button
                    class='flex-1'
                    onClick={isRunning() ? stop : start}
                  >
                    <Show when={isRunning()}>{translator('scanner.stop')}</Show>
                    <Show when={!isRunning()}>
                      {translator('scanner.start')}
                    </Show>
                  </Button>

                  <Button
                    variant='ghost'
                    size='icon'
                    onClick={() => {
                      // no-op for now
                    }}
                  >
                    <Settings />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <div class='flex gap-4 justify-center'>
            <p>{translator('made_with_love', { name: 'Q.Trinh' })}</p>
          </div>
        </div>
      </div>
    </>
  );
}

export { CheckInPage };

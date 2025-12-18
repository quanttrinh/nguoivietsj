import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  Switch,
} from 'solid-js';

import Loader from 'lucide-solid/icons/loader';
import Check from 'lucide-solid/icons/check';

import { callScript } from '~web/lib/googleapi';
import { getMeta } from '~/web/common/meta';

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
  TextField,
  TextFieldErrorMessage,
  TextFieldInput,
} from '~/web/ui/text-field';

import * as i18n from '@solid-primitives/i18n';
import * as enDict from '../locales/en.json';
import * as frDict from '../locales/fr.json';
import * as vnDict from '../locales/vn.json';
import { LocaleSwitcher } from '~/web/common/components/locale-switcher';

import { Sha256 } from '@aws-crypto/sha256-browser';

function PasswordProtectorPage() {
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
   * Main logic
   */
  const [validationState, setValidationState] = createSignal<
    'idle' | 'validating' | 'valid'
  >('idle');

  const [password, setPassword] = createSignal<string>('');
  const [error, setError] = createSignal<string | undefined>(undefined);

  createEffect(() => {
    const value = password().trim();
    if (!value) {
      setError(translator('password_field_required'));
      return;
    }

    setError(undefined);
  });

  const handleSubmit = async () => {
    try {
      setValidationState('validating');

      const sessionId = getMeta('SESSION_ID') || '';

      const passwordHash = new Sha256(sessionId);
      passwordHash.update(password());

      const isValid = await callScript(
        'validatePassword',
        null,
        (await passwordHash.digest()).reduce((str, byte) => {
          return (
            str + (byte < 0 ? 256 + byte : byte).toString(16).padStart(2, '0')
          );
        }, ''),
        sessionId
      );

      if (isValid) {
        setValidationState('valid');

        // Get the target page from meta tag
        const targetPage = getMeta('TARGET_PATH') || '/';

        // Redirect to the target page with SESSION_ID as query parameter
        const url = new URL(getMeta('BASE_URL') + targetPage);
        url.searchParams.set('session_id', sessionId);

        const linkElm = document.createElement('a');
        linkElm.href = url.toString();
        linkElm.hidden = true;
        document.body.append(linkElm);
        linkElm.click();
        linkElm.remove()
      } else {
        setValidationState('idle');
        setError(translator('password_incorrect'));
      }
    } catch (err) {
      setValidationState('idle');
      console.error('Error validating password:', err);
    }
  };

  return (
    <>
      <div class='min-w-xs w-full min-h-full place-content-center-safe'>
        <div class='flex flex-col gap-4 max-w-md mx-auto p-2 md:p-4'>
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
              <div class='flex flex-col gap-1'>
                <Label for={`${componentId}-password`}>
                  {translator('password.label')}
                </Label>
                <TextField invalid={!!error()}>
                  <TextFieldInput
                    id={`${componentId}-password`}
                    name='password'
                    placeholder={translator('password.placeholder')}
                    class='w-full'
                    type='password'
                    disabled={validationState() !== 'idle'}
                    value={password()}
                    onInput={(e) => {
                      setPassword(e.currentTarget.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !error()) {
                        handleSubmit();
                      }
                    }}
                  />
                  <TextFieldErrorMessage>{error()}</TextFieldErrorMessage>
                </TextField>
              </div>
              <div class='flex justify-end gap-4'>
                <Button
                  type='submit'
                  disabled={validationState() !== 'idle' || !!error()}
                  onClick={handleSubmit}
                >
                  <Switch fallback={translator('submit')}>
                    <Match when={validationState() === 'validating'}>
                      <Loader class='animate-spin' />
                    </Match>
                    <Match when={validationState() === 'valid'}>
                      <Check />
                    </Match>
                  </Switch>
                </Button>
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

export { PasswordProtectorPage };

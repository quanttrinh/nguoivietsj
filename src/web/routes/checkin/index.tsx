// @ts-ignore: optional polyfill provided by Vite in some environments
import 'vite/modulepreload-polyfill';

import { initializeApp } from '~web/common/index';
import { CheckInPage } from '~/web/routes/checkin/components/app';

initializeApp(() => <CheckInPage />);

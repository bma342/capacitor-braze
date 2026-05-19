import { registerPlugin } from '@capacitor/core';

import type { BrazePlugin } from './definitions';

const Braze = registerPlugin<BrazePlugin>('Braze', {
  web: () => import('./web').then((m) => new m.BrazeWeb()),
});

export * from './definitions';
export { Braze };

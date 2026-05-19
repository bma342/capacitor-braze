import { registerPlugin } from '@capacitor/core';

import type { BrazePlugin } from './definitions';

const Braze = registerPlugin<BrazePlugin>('Braze', {
  web: () => import('./web').then((m) => new m.BrazeWeb()),
});

export * from './definitions';
export { Braze };

// Re-export the Capacitor types the plugin's interface uses so consumers
// don't need a separate `import type { PluginListenerHandle } from '@capacitor/core'`
// alongside their plugin import.
export type { PluginListenerHandle } from '@capacitor/core';

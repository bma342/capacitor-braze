import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';

import { initBraze } from './braze/client';
import { router } from './router';
import './styles/index.css';

/**
 * App boot order:
 *   1. Initialize Braze. The promise resolves either on success OR on
 *      a clear no-op when env vars are missing (see `braze/client.ts`).
 *      Either way, we proceed to render — the demo is browsable without
 *      a live Braze project.
 *   2. Mount the React app.
 *
 * Initialization is awaited so events fired during the first render
 * (e.g. an automatic `vertical_viewed` on landing) hit a configured
 * SDK, not a not-yet-initialized one.
 */
async function bootstrap(): Promise<void> {
  await initBraze();

  const rootEl = document.getElementById('root');
  if (!rootEl) {
    throw new Error('demo: #root element not found in index.html');
  }
  createRoot(rootEl).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}

void bootstrap();

import { Braze } from 'capacitor-braze';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Mock user shape for the demo. Production apps would source this from
 * their backend; the demo just accepts any email and fabricates a stable
 * pseudo-id so Braze sees a consistent userId across sessions.
 */
export interface DemoUser {
  userId: string;
  email: string;
  displayName: string;
}

interface AuthState {
  user: DemoUser | null;
  signIn: (email: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * Zustand store with localStorage persistence. The `signIn` and
 * `signOut` actions also tell Braze about the identity change so events
 * the user fires after signing in are attributed to their userId.
 *
 * For the demo, the userId is derived from a sha-style hash of the
 * email so the same email always maps to the same id across sessions —
 * mimics the stable internal-id pattern a real backend would provide.
 */
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,

      signIn: async (email, displayName) => {
        const userId = pseudoUserId(email);
        const user: DemoUser = { userId, email, displayName };
        set({ user });
        // Identify with Braze. In production this call carries an
        // sdkAuthSignature from the backend (see SECURITY.md §2).
        try {
          await Braze.changeUser({ userId });
          await Braze.setEmail({ email });
          await Braze.setFirstName({ firstName: displayName.split(' ')[0] ?? null });
        } catch (err) {
          console.warn('[demo] Braze identify failed:', (err as Error).message);
        }
      },

      signOut: async () => {
        set({ user: null });
        // GDPR-style logout: clear locally cached Braze data and pause
        // tracking until the next sign-in. See C07 for the
        // init-independence rationale.
        try {
          await Braze.wipeData();
        } catch (err) {
          console.warn('[demo] Braze wipeData failed:', (err as Error).message);
        }
      },
    }),
    {
      name: 'demo-auth',
      partialize: (state) => ({ user: state.user }),
    },
  ),
);

/**
 * Deterministic pseudo-id from email. Not cryptographic; the demo just
 * needs a stable string per email so Braze sees a consistent userId
 * across sessions for the same demo account.
 */
function pseudoUserId(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash * 31 + email.charCodeAt(i)) | 0;
  }
  return `demo_${(hash >>> 0).toString(36)}`;
}

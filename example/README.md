# capacitor-braze — example app

A minimal Capacitor app that exercises every method exposed by the parent
`capacitor-braze` plugin. Use this to smoke-test changes locally and to validate
the plugin against a real Braze account.

## What it does

A single web page renders a UI for every plugin method (`initialize`,
`changeUser`, `setEmail`, etc.) with input fields for arguments and a live log
panel that shows the result of each call.

Runs in three modes:

1. **Browser dev** (`npm run dev`) — uses the web fallback (`@braze/web-sdk`).
2. **iOS native** — bridge to BrazeKit.
3. **Android native** — bridge to `com.braze:android-sdk-ui`.

The same TypeScript source drives all three.

## Prerequisites

- Node 22+
- For iOS: Xcode 16+, macOS, `pod` (`gem install cocoapods`)
- For Android: Android Studio + Android SDK 35
- A Braze account. The 14-day trial at <https://try.braze.com/free_trial>
  works fine and requires no credit card.

## Setup

```bash
# From the example/ directory:
cd example
npm install

# This also installs the parent plugin via `file:..`. If you change the
# plugin code, re-run `npm run build` at the repo root, then `npm install`
# here to pick up the rebuilt artifacts.
```

## Run on web

```bash
npm run dev
```

Opens at <http://localhost:5173>. Fill in your Braze SDK API key and endpoint
(e.g. `sdk.iad-03.braze.com` — find yours in Braze dashboard → Settings →
Manage Settings), then click `initialize`.

After init, exercise the other methods. Each call logs to the on-page panel
and (in the case of `logCustomEvent` etc.) should appear in the Braze
dashboard within ~30 seconds.

## Add native platforms

The example ships with the web layer ready. The native platform projects are
generated locally — they're not committed because they're large and
machine-specific:

```bash
# From example/:
npm run build
npx cap add ios       # creates ios/
npx cap add android   # creates android/
npx cap sync          # copies plugin + web bundle into both
```

## Run on iOS

```bash
npm run cap:ios   # builds, syncs, opens Xcode
```

In Xcode, select a simulator or device, then ⌘R to build and run. Use the
same UI as the browser version.

## Run on Android

```bash
npm run cap:android   # builds, syncs, opens Android Studio
```

In Android Studio, sync Gradle, then run.

## Smoke test against real Braze

1. Sign up for the [Braze free trial](https://try.braze.com/free_trial).
2. From the dashboard, **Settings → Manage Settings** — copy your **SDK API
   key** (NOT the REST API key) and your endpoint (e.g. `sdk.iad-03.braze.com`).
3. In the example app:
   - Paste both into the Configuration card.
   - Click `initialize`.
   - Click `changeUser` with a `userId` like `smoke_test_user_1`.
   - Click `setEmail` with `test@example.com`.
   - Click `logCustomEvent` with `name: smoke_test_event`.
   - Click `requestImmediateDataFlush` to bypass batching.
4. In the Braze dashboard, navigate to **Users → User Search**, find
   `smoke_test_user_1`. The custom event and email attribute should appear
   within 30 seconds.

Repeat on iOS and Android. If any method works on web but fails on a native
platform, that's a bridge bug — open an issue on the parent repo.

## Gotchas

- **`@braze/web-sdk` and Vite:** the SDK breaks Vite's dependency
  pre-bundling. We exclude it via `optimizeDeps.exclude` in `vite.config.ts`
  (see comments there). If you fork this example with a different bundler,
  read the Braze Web SDK README's framework section.
- **HTTPS requirement:** `Braze.initialize` rejects `http://` endpoints in
  production. Use `allowInsecureEndpoint: true` only for local mock-server
  testing per `SECURITY.md` §4 (in the parent repo).
- **Anonymous users:** if you call `setEmail` etc. before `changeUser`, the
  attributes attach to an anonymous Braze profile. Calling `changeUser` later
  merges these into the identified profile.

## Layout

```
example/
├── README.md              # this file
├── package.json           # vite + capacitor + plugin via file:..
├── tsconfig.json
├── vite.config.ts         # excludes @braze/web-sdk from prebundling
├── capacitor.config.ts    # appId, appName, webDir
├── index.html             # UI for every plugin method
└── src/
    ├── main.ts            # method dispatch + log panel
    └── style.css
```

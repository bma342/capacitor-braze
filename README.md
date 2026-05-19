# capacitor-braze

> Capacitor 6+ plugin wrapping the official Braze SDKs for Android, iOS, and Web. **Pre-release scaffold — not yet published to npm.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Capacitor 6+](https://img.shields.io/badge/Capacitor-6%2B-blue.svg)](https://capacitorjs.com/)

A community-maintained plugin that exposes the Braze customer engagement SDKs to Capacitor apps with a single TypeScript API across iOS, Android, and Web. Not affiliated with or endorsed by Braze, Inc.

## Why this exists

Braze ships first-party SDKs for native Android, iOS, Web, React Native, Flutter, Cordova, Expo, Unity, Xamarin, and Roku — but **not Capacitor**. Today's options for Capacitor teams are: ship the Cordova SDK (broken push handoff in Capacitor 6+), use the Web SDK only (lose native push + IAM), roll a custom bridge (2–3 weeks of native work), or skip Braze. This plugin makes it `npm install` + 10 lines.

See the [demand evidence](./PLAN.md#2-market-validation-already-done) and [strategic plan](./PLAN.md).

## Status

| Phase | Status |
|---|---|
| Strategic documentation | ✅ complete |
| Scaffold (0.0.1) | 🔨 in progress |
| v0.1.0 (15 daily-use methods) | ⏳ target: 3 weeks from scaffold |
| v0.2.0 (feature flags + enrichment) | ⏳ planned |
| v1.0.0 (stable) | ⏳ requires ≥5 production users |

See [`PLAN.md` §7](./PLAN.md#7-phased-roadmap) for the full roadmap.

## Quick start (preview — works once 0.1.0 ships)

```bash
npm install capacitor-braze @braze/web-sdk
npx cap sync
```

```ts
import { Braze } from 'capacitor-braze';

await Braze.initialize({
  apiKey: 'YOUR-SDK-API-KEY',
  endpoint: 'sdk.iad-03.braze.com',
  enableSdkAuthentication: true,
});

await Braze.changeUser({
  userId: 'user_123',
  sdkAuthSignature: '<jwt-from-your-backend>',
});

await Braze.logCustomEvent({ name: 'app_opened' });
```

**Which API key do I use?** SDK key (public, embedded in app), not REST key (secret, server-only). See [`SECURITY.md` §1](./SECURITY.md#1-api-keys--public-sdk-keys-vs-secret-rest-keys).

## Documentation

| Doc | Purpose |
|---|---|
| [`PLAN.md`](./PLAN.md) | Strategy, market validation, phased roadmap, risks |
| [`SDK_SURFACE.md`](./SDK_SURFACE.md) | Complete Braze SDK capability catalog × plugin coverage |
| [`SECURITY.md`](./SECURITY.md) | Threat model + plugin design decisions for every security-sensitive surface |
| [`REVIEW_READINESS.md`](./REVIEW_READINESS.md) | Quality bar + pre-release checklist |
| [`CHANGELOG.md`](./CHANGELOG.md) | Release history |
| [`CLAUDE.md`](./CLAUDE.md) | AI developer guide for this repo |

## Native SDK versions

Pinned exactly per [release pinning policy](./SDK_SURFACE.md#4-native-sdk-pinning--bump-policy):

- `com.braze:android-sdk-ui` **42.2.0**
- `BrazeKit` / `BrazeUI` **14.1.0**
- `@braze/web-sdk` peer dep `^6.0.0`

## Contributing

Issues and PRs welcome. Before opening either:
1. Check if the issue is a [Braze SDK issue](https://github.com/braze-inc/braze-android-sdk/issues) (route there if so).
2. Read [`CLAUDE.md`](./CLAUDE.md) for the project's conventions.
3. New methods require a scope decision in [`SDK_SURFACE.md`](./SDK_SURFACE.md#2-plugin-version-roadmap).

## License

[MIT](./LICENSE) © 2026 Bryce Aspinwall

## Disclaimer

This is a community plugin. It is not officially affiliated with, endorsed by, or supported by Braze, Inc. Braze, BrazeKit, BrazeUI, and related marks are property of Braze, Inc.

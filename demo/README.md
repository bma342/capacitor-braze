# capacitor-braze-demo

A **working Capacitor app** that you can fork as the starting point for a Capacitor + Braze integration. Mock backend, real plugin wiring, both restaurant-ordering and e-commerce flows.

This is **not** an Aromo derivative — it's a fresh, MIT-licensed reference that ships alongside the plugin source. Goal: a developer can clone this repo, run two commands, see the plugin working end-to-end against their own Braze trial account, and copy the wiring patterns into their real app.

## What's different from `../example/`

| Surface | `example/` | `demo/` |
|---|---|---|
| Purpose | Developer testbed — every method has a button | Realistic consumer-feeling app |
| UI | Plain HTML + buttons + log panel | React 19 + TanStack Router + Tailwind 4 |
| Flows | None — methods invoked directly | Sign-in → browse → cart → checkout → promotions |
| Stack | Vite + vanilla TS | Vite 6 + React 19 + Zustand 5 + TanStack Router |
| Native | Web only | iOS + Android Capacitor projects (run `cap add` first time) |
| Audience | Plugin maintainers | Consumers evaluating the plugin |

## Stack

- **React 19** + TypeScript strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`).
- **Vite 6** — modern build, native ESM, fast HMR.
- **Tailwind CSS 4** — CSS-first config (no `tailwind.config.js`; theme tokens live in `src/styles/index.css` via `@theme`).
- **TanStack Router** — typed routes, programmatic route tree (one router file).
- **Zustand 5** — minimal state with `persist` middleware for cart + auth.
- **Capacitor 6** — peer-aligned with the plugin's published pin.

## Quick start

```bash
cd demo
npm install

# Copy + fill in your Braze trial keys
cp .env.example .env.local
$EDITOR .env.local

# Web preview (no native)
npm run dev
# → http://localhost:5173

# Add native platforms once per checkout (needs CocoaPods for iOS,
# Android SDK for Android)
npm run cap:add:ios
npm run cap:add:android

# Sync built web assets into the native projects
npm run build && npm run cap:sync

# Open native apps in Xcode / Android Studio
npm run cap:open:ios
npm run cap:open:android
```

If `VITE_BRAZE_API_KEY` / `VITE_BRAZE_ENDPOINT` are missing the app still runs — Braze methods no-op with a console warning. Useful for browsing the flow without a live account.

## App map

```
┌─────────────┐
│ /login      │  mock sign-in → Braze.changeUser + setEmail
└─────┬───────┘
      ▼
┌─────────────┐
│ /           │  Home tab — two CTAs (Eat / Shop)
├─────────────┤
│ /restaurants│  Eat vertical — browse → detail → menu item → add-to-cart
├─────────────┤
│ /shop       │  Shop vertical — browse → detail → add-to-cart
├─────────────┤
│ /cart       │  Mixed cart
├─────────────┤
│ /checkout   │  → Braze.logPurchase per line, clears cart
├─────────────┤
│ /promotions │  Braze.getContentCards + addListener('contentCardsUpdated')
├─────────────┤
│ /profile    │  User attribute editing
├─────────────┤
│ /settings   │  Subscription groups, feature-flag A/B, disableSDK, wipeData
└─────────────┘
```

## Project structure

```
demo/
├── capacitor.config.ts       # appId: dev.bma342.demo.braze
├── vite.config.ts            # @tailwindcss/vite + @vitejs/plugin-react + TanStack Router plugin
├── index.html
├── src/
│   ├── main.tsx              # boots app, awaits initBraze()
│   ├── router.tsx            # TanStack Router route tree
│   ├── braze/
│   │   ├── client.ts         # initBraze() — env-gated; never blocks render
│   │   └── events.ts         # typed `track.*` helpers — single point of truth for event names
│   ├── auth/store.ts         # Zustand store; signIn → Braze.changeUser, signOut → Braze.wipeData
│   ├── cart/store.ts         # Zustand store; persisted across reloads
│   ├── mockData/
│   │   ├── restaurants.ts    # 3 restaurants × 3 menu items
│   │   └── products.ts       # 6 products across 4 categories
│   ├── components/
│   │   ├── Layout.tsx        # auth gate + chrome
│   │   ├── TopBar.tsx        # brand + cart badge + profile link
│   │   └── BottomNav.tsx     # 5-tab bottom nav, active-state highlight
│   ├── pages/                # one file per route (matches `router.tsx`)
│   └── styles/index.css      # Tailwind 4 + safe-area-inset padding
└── README.md
```

## Status

This is **Phase L.1** — scaffolding plus mock auth + home page. Pages for `restaurants`, `shop`, `cart`, `checkout`, `promotions`, `profile`, `settings` are routed but contain placeholders. Subsequent phases fill them in:

| Phase | Adds |
|---|---|
| L.2 | Restaurant browse + detail + menu-item-add-to-cart, `track.restaurantViewed` / `menuItemViewed` |
| L.3 | Shop browse + detail + product-add-to-cart, `track.productViewed` |
| L.4 | Checkout, `Braze.logPurchase` per line |
| L.5 | Profile attribute editing, settings (subscription groups, feature flags, privacy) |
| L.6 | Promotions tab via content cards + listener |

## Not Aromo

This demo is unrelated to Aromo. No Aromo backend, no Aromo branding, no Aromo IP. It's a fresh reference app that ships alongside the plugin so consumers have a working starting point.

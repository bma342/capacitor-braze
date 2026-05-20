# Web smoke pass — YYYY-MM-DD

> Copy this template to `web-YYYY-MM-DD.md`, then walk [`SMOKE-TEST-PLAYBOOK.md §3`](../SMOKE-TEST-PLAYBOOK.md#3-web-smoke-20-min). Fill in as you go.

## Setup

- **Trial workspace URL:** https://dashboard-XX.braze.com/...
- **Web SDK API key (prefix only):** `abc123-...`
- **Endpoint:** `sdk.iad-03.braze.com`
- **Plugin version:** `0.0.X` (from `package.json`)
- **`@braze/web-sdk` version:** `6.X.X` (from `demo/package-lock.json`)
- **Capacitor version:** `6.X`
- **Browser used:** Chrome / Safari / Firefox + version
- **Demo start command run:** `cd demo && npm run dev`

## Pre-flight

- [ ] `demo/.env.local` filled with `VITE_BRAZE_API_KEY` + `VITE_BRAZE_ENDPOINT`
- [ ] `npm run build && npx cap sync` ran cleanly
- [ ] Devtools open with Network tab filtered to `*braze*`
- [ ] Dashboard open in a second tab on the user-profile search page

## Steps executed

- [ ] 1. Sign in: `web-trial-<date>@example.com`, name "Alex"
  → Dashboard: Users → search `demo_*` userId → profile created
- [ ] 2. Eat → "Olive & Vine" → "Lamb gyro plate" → Add to cart
  → Events `vertical_viewed`, `restaurant_viewed`, `menu_item_viewed`, `added_to_cart` appear with properties
- [ ] 3. Shop → "Linen field tote" → Add to cart
  → Events `vertical_viewed`, `product_viewed`, `added_to_cart`
- [ ] 4. Cart → Checkout → Place order
  → Purchases → `sku_42` with USD revenue + `checkout_started` event
- [ ] 5. Profile → set email + first name + DOB + custom attribute
  → User profile attributes panel shows all values
- [ ] 6. Settings → add subscription group ID (real Braze-issued one)
  → User profile → subscription groups → newly added
- [ ] 7. Settings → look up a feature flag (configure one in dashboard first)
  → Lookup returns configured flag
- [ ] 8. Settings → Pause tracking
  → Subsequent demo activity does NOT appear in dashboard
- [ ] 9. Settings → Resume tracking
  → Activity resumes
- [ ] 10. Settings → Delete my data
  → User profile disappears OR stops accumulating

## Captures (highest-leverage data)

**`logCustomEvent` wire body** (copy raw POST body from devtools Network → `/api/v3/data/` request):

```json
PASTE HERE
```

**`setDateOfBirth` wire body** (after Step 5):

```json
PASTE HERE
```

Note any padding/normalization on the DOB value: e.g., `1987-7-14` vs. `1987-07-14`.

**`FeatureFlag` DTO returned** (after Step 7, from devtools Console or app log):

```json
PASTE HERE
```

**`ContentCard` DTO returned** (if a content card is configured in dashboard; trigger via `getCachedContentCards()` call):

```json
PASTE HERE
```

## Screenshots

Drop into `docs/smoke-tests/screenshots/` (gitignored locally; commit if useful):

- [ ] Dashboard user profile with custom attributes
- [ ] Devtools network tab showing one event POST
- [ ] One error/warning from browser console (if any)

## Issues filed

- (link issues opened during this pass — anything that wasn't expected behavior)

## Verdict

- [ ] All 10 steps passed cleanly. Wire format matches `test/web` fixtures. Safe to proceed.
- [ ] N issues filed; gate to 0.1.0 once they close: #__, #__, #__
- [ ] Field-shape drift to investigate before 0.1.0: __________

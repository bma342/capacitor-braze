# Smoke-test playbook — Braze trial validation

**Walks every shipped plugin method against a real Braze trial account, captures the wire format each platform actually produces, and verifies the dashboard receives the expected data. The Layer 4 step from `PLAN.md §5`.**

This is the gate to tagging `0.1.0`. The web bridge has 53 vitest-mock tests proving its wire output; this playbook does the same job for iOS + Android, plus validates that Braze's backend processes the data correctly across all three platforms.

Estimate: ~2-3 hours of focused work end-to-end. Less if your trial is already provisioned.

---

## 1. Prereqs

- [ ] **Braze 14-day trial** provisioned. Sign up at https://www.braze.com/get-started.
  Use a company email; freemail addresses get filtered. After signup you should have:
  - A workspace at `https://dashboard-XX.braze.com/`
  - At least one app group set up (iOS / Android / Web — create all three)
- [ ] **Three SDK API keys** (one per platform) from the dashboard:
  Settings → APIs and Identifiers → SDK API Keys
- [ ] **Endpoint** for your trial cluster (e.g. `sdk.iad-03.braze.com`).
  Shown next to the API key in the dashboard.

---

## 2. Environment setup

```bash
cd /Users/bryceaspinwall/eatsuite/capacitor-braze/demo

# Copy the env template and fill in your trial keys
cp .env.example .env.local

cat > .env.local <<EOF
VITE_BRAZE_API_KEY=<your-web-sdk-key>
VITE_BRAZE_ENDPOINT=sdk.iad-03.braze.com
EOF

# Build the demo's web assets + sync into native projects
npm install
npm run build
npx cap sync
```

For iOS native testing, drop the iOS API key into the demo by editing
`demo/ios/App/App/AppDelegate.swift` to set up Braze with the iOS key
on app launch (the consumer-side wiring per Braze's iOS install guide).

For Android, edit `demo/android/app/src/main/AndroidManifest.xml` and
`braze.xml` to embed the Android API key + endpoint.

(The plugin's `Braze.initialize()` call in `demo/src/braze/client.ts`
uses the Web SDK key; native code paths read from their own
configurations.)

---

## 3. Web smoke (~20 min)

The web path already has 53 mock-server tests, but this validates that
the **real Braze backend** processes the events too — catching any
backend-side validation we don't model in the mock.

```bash
npm run dev
# → http://localhost:5173
```

Walk through the demo flows:

| Step | Action | Verify in Braze dashboard |
|---|---|---|
| 1 | Sign in with `web-trial@example.com` / "Alex" | Users → search `demo_*` userId → profile created |
| 2 | Tap **Eat** → "Olive & Vine" → "Lamb gyro plate" → Add to cart | Custom events: `vertical_viewed`, `restaurant_viewed`, `menu_item_viewed`, `added_to_cart` appear with correct properties |
| 3 | Tap **Shop** → "Linen field tote" → Add to cart | `vertical_viewed`, `product_viewed`, `added_to_cart` |
| 4 | Open **Cart** → **Checkout** → **Place order** | Purchase analytics → `sku_42` (or whatever product ids) appear with USD revenue. `checkout_started` event also logged |
| 5 | **Profile** → set email + first name + DOB + custom attribute | User profile → attributes panel shows all values |
| 6 | **Settings** → add a subscription group ID (use a real Braze-issued one from the dashboard) | User profile → subscription groups → newly added |
| 7 | **Settings** → look up a feature flag (configure one in the dashboard first) | Verify lookup returns the configured flag |
| 8 | **Settings** → Pause tracking | Subsequent demo activity does NOT appear in dashboard |
| 9 | **Settings** → Resume tracking | Activity resumes |
| 10 | **Settings** → Delete my data | User profile in dashboard either disappears or stops accumulating |

**Capture for the project log:**
- Screenshot of one event landing in the dashboard
- A copy-paste of any error / warning from the browser console
- A copy-paste of one full event payload from devtools Network tab (validates wire format matches what `test/web` captures)

If any step fails: write up the symptom + expected behavior in a new GitHub issue and tag it `smoke-test`. Don't fix in this pass — capture first, fix in dedicated follow-ups.

---

## 4. iOS smoke (~30-45 min)

```bash
cd demo
npx cap open ios
# Xcode opens; build + run on simulator
```

Repeat the same 10-step flow on the simulator. Same dashboard verification. Additionally:

| Step | Action | Verify |
|---|---|---|
| 11 | Wire `@capacitor/push-notifications` per its README, request permission on first launch, capture the APNs token in console | Token format matches what `Braze.registerPushToken({ token })` expects (hex string). Confirm token POSTed correctly per device profile in dashboard |
| 12 | Trigger an APNs push from the Braze dashboard targeted at the test userId | Push arrives on simulator. Tap → app opens, deep link handled if configured |

Critical things to capture during iOS smoke:

- **Compare DOB wire format**: `setDateOfBirth({ year: 1987, month: 7, day: 14 })` — web emits `"dob":"1987-7-14"`. What does iOS BrazeKit emit? Find out from Charles Proxy or Network Conditioner intercepting the simulator's HTTPS (or check dashboard rendering).
- **Feature flag property shape**: configure a flag in dashboard with each type (string, number, boolean, image, datetime, jsonobject); call `getFeatureFlag` on iOS; inspect what the bridge returns vs. what the web bridge returns for the same flag. **Any cross-platform field-name drift is a real bug** that wire-format reconciliation needs to address.
- **Content card wire format**: same exercise for content cards. Cross-check `card.json()` iOS output against the Web SDK's `Card` shape.

These three field-shape captures are the highest-value data the smoke produces — they validate whether the C02 "Web SDK is canonical" DTO claim holds on iOS in practice.

---

## 5. Android smoke (~30-45 min)

```bash
cd demo
npx cap open android
# Android Studio opens; build + run on emulator
```

Same 10-step flow + push registration (step 11, FCM token instead of APNs hex; the bridge accepts the string verbatim per C03).

Same field-shape comparisons as iOS:
- DOB wire format
- Feature flag property shape
- Content card wire format

Cross-reference all three against iOS + Web. If there's drift, write up the diff in a new issue.

---

## 6. Capture log template

For each platform, fill in:

```markdown
## <Platform> smoke — <date>

### Setup
- Trial workspace: <url>
- API key: <prefix>...
- Endpoint: <e.g. sdk.iad-03.braze.com>
- Plugin version: 0.0.X
- Capacitor version: 6.X

### Steps executed
- [x] 1. ...
- [x] 2. ...
...

### Captures
**logCustomEvent wire body:** <paste>
**setDateOfBirth wire body:** <paste>
**FeatureFlag DTO returned:** <paste>
**ContentCard DTO returned:** <paste>

### Issues filed
- #N — <title>
- ...

### Verdict
☐ All 12 steps passed; safe to tag 0.1.0
☐ N issues filed; gate to 0.1.0 once they close
```

Drop the filled-in log into `docs/smoke-tests/<platform>-YYYY-MM-DD.md`. These build up over time as a regression timeline.

---

## 7. After all three platforms green

Open a PR titled `chore: smoke-test pass for v0.1.0`. The PR description includes:
- Links to the three capture logs
- Summary of any field-shape drift discovered (and what was fixed)
- The verdict line from each platform

Once merged, tag `v0.1.0` and the release.yml workflow handles the npm publish.

---

## Why this exists

The 53 web behavioral tests catch wire-format regressions on a real PR. The compile-only iOS + Android CI gates catch SDK API drift. **What neither catches is what Braze's backend actually accepts** — and what its dashboard renders for each platform. That's only validable against a real account.

Doing this smoke once (now, before 0.1.0) establishes the cross-platform wire-format ground truth. After 0.1.0 ships, [C11](./mdcs/C11-NATIVE-TEST-HARNESSES.md)'s native mock harnesses lock that ground truth in for every future PR.

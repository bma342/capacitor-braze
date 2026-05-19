# Contributing to capacitor-braze

Thanks for your interest. This is a community plugin maintained on a best-effort
basis; PRs are welcome and reviewed actively.

## Before you start

1. **Read the source-of-truth docs**:
   - [`PLAN.md`](./PLAN.md) — strategy, roadmap, scope discipline
   - [`SDK_SURFACE.md`](./SDK_SURFACE.md) — which methods are planned, in which version
   - [`SECURITY.md`](./SECURITY.md) — security model and design constraints
   - [`REVIEW_READINESS.md`](./REVIEW_READINESS.md) — quality bar
   - [`CLAUDE.md`](./CLAUDE.md) — internal dev guide (also useful for humans)
2. **Confirm scope.** New methods must align with [SDK_SURFACE.md §2](./SDK_SURFACE.md#2-plugin-version-roadmap). If your feature isn't on the roadmap, open an issue first to discuss.
3. **Confirm it's a plugin issue, not a Braze SDK issue.** If `@braze/web-sdk` (or the native SDK) fails the same way without this plugin, file with Braze instead.

## Dev setup

```bash
# Clone + install plugin deps
git clone https://github.com/bma342/capacitor-braze.git
cd capacitor-braze
npm install

# Build the plugin
npm run build

# Run the example app
cd example
npm install
npm run dev          # → http://localhost:5173
```

Iterating? After plugin changes, rebuild and re-run npm install in example/:

```bash
# In repo root
npm run build

# In example/
npm install   # picks up the rebuilt artifacts via file:.. link
```

## Adding a new plugin method

Every new method must touch **eight files in lockstep** (the PR template
enforces this checklist):

1. `src/definitions.ts` — type signature with JSDoc + `@example`
2. `src/web.ts` — web implementation
3. `ios/Plugin/BrazePlugin.swift` — iOS bridge
4. `ios/Plugin/BrazePlugin.m` — `CAP_PLUGIN_METHOD` registration
5. `android/src/main/java/com/bma342/braze/BrazePlugin.kt` — Android bridge
6. `example/index.html` — UI input + button
7. `example/src/main.ts` — handler in `runMethods` map
8. `CHANGELOG.md` — entry under `[Unreleased]`

Skip any one of these and you'll get drift between the platforms.

### Bridge style

Match existing patterns exactly:

- **TS:** strict mode, no `any`, JSDoc with `@example` on every public method
- **Swift:** `@objc func name(_ call: CAPPluginCall)`, guard required inputs, dispatch to `Braze` SDK static or `braze.user.set(...)` instance methods, resolve/reject via the call
- **Kotlin:** `@PluginMethod fun name(call: PluginCall)`, use the `requireInitialized` or `requireUser` helpers, dispatch to `Braze.getInstance(context)` or `currentUser` setters
- **`MARK:` / KDoc category comments** matching the existing structure

If a method needs the init guard, use the helper — don't reimplement.

### Cross-platform divergence

When a Braze capability genuinely doesn't exist on a platform:

- On the unsupported platform, throw a clear `UnsupportedOperationError`-shaped
  error pointing at the docs.
- Document in [SDK_SURFACE.md §3](./SDK_SURFACE.md#3-cross-platform-divergence-notes).

## PR checklist

The PR template has the full list. Highlights:

- [ ] `npm run build` clean in repo root + `example/`
- [ ] CI green
- [ ] No PII logged
- [ ] No `any` types
- [ ] `enableLogging` default still `false`
- [ ] CHANGELOG entry added
- [ ] Tested against real Braze (or noted explicitly in the PR if you couldn't)

## Code of conduct

Be respectful. Assume good faith. No harassment, discrimination, or personal
attacks. Report concerns to bryce.aspinwall@gmail.com.

## License

By contributing, you agree your contributions are licensed under the MIT
license (same as the rest of the project).

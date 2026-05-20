# Repo hygiene — one-time setup

The personal-account / local-machine settings the maintainer must configure once. Sister to [`REVIEW_READINESS.md §7`](../REVIEW_READINESS.md#7-blockers-to-tag-010) item 5. Everything that could be automated via `gh` CLI has already been applied to the `bma342/capacitor-braze` repo (see "Already applied" below). What remains lives on your account or machine.

---

## Already applied to `bma342/capacitor-braze` (via `gh` CLI)

Branch protection on `main`:

- Required status checks (must pass, branch must be up-to-date before merge):
  - Security audit (plugin only)
  - Build plugin (TS + Rollup + docgen)
  - Lint (ESLint + Prettier)
  - Web behavioral tests (vitest + jsdom + mock)
  - Build demo app
  - Build example app
  - Verify iOS (Xcode build against BrazeKit)
  - Verify Android (Gradle build against com.braze:android-sdk-ui)
- `allow_force_pushes`: false
- `allow_deletions`: false
- `required_conversation_resolution`: true
- `enforce_admins`: false (you, as admin, can still hotfix during incidents)
- `required_pull_request_reviews`: null (solo project; revisit when a second maintainer joins)

To audit / change later:

```bash
gh api repos/bma342/capacitor-braze/branches/main/protection
gh api -X PUT repos/bma342/capacitor-braze/branches/main/protection --input <(...)
```

---

## Step 1: Set up signed commits locally (SSH signing, recommended)

GitHub supports GPG, SSH, and S/MIME signatures. SSH is the simplest because you almost certainly already have an SSH key.

```bash
# Use your existing SSH key as a signing key
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```

You also need to tell git which signing keys to trust as "good." Create `~/.ssh/allowed_signers`:

```bash
echo "$(git config user.email) $(cat ~/.ssh/id_ed25519.pub)" >> ~/.ssh/allowed_signers
git config --global gpg.ssh.allowedSignersFile ~/.ssh/allowed_signers
```

Verify a new commit signs correctly:

```bash
git commit --allow-empty -m "test: signing"
git log --show-signature -1   # should show: Good "git" signature
```

If `--show-signature` complains, double-check `gpg.ssh.allowedSignersFile` and that the public key text in `allowed_signers` exactly matches the file used as signing key.

---

## Step 2: Add the SSH key as a *signing* key on GitHub

Authentication keys and signing keys are separate uploads on GitHub even when they are the same key file.

1. Go to https://github.com/settings/ssh/new
2. **Key type:** select "Signing Key" (NOT Authentication Key)
3. **Title:** "capacitor-braze signing key" (or whatever you want)
4. **Key:** paste the contents of `~/.ssh/id_ed25519.pub`

Once uploaded, all your future signed commits show up with a green "Verified" badge in the GitHub UI.

---

## Step 3: `required_signatures` on `main` — already enabled

The required-signatures rule is currently enabled (verify with `gh api repos/bma342/capacitor-braze/branches/main/protection/required_signatures` → `{"enabled": true}`).

Until Steps 1+2 are done, any direct push to `main` from your machine will hit this rule and require admin bypass (since `enforce_admins: false`). The push still goes through but GitHub records a "Bypassed rule violations" notice on the push.

Once Steps 1+2 are done, your commits sign automatically and the bypass notices stop.

PR squash-merges via the GitHub UI auto-sign with GitHub's web-flow key, so PR workflows are clean regardless of local-signing setup.

---

## Step 4: npm 2FA (mandatory before 0.1.0 publish)

```bash
npm login                          # if not already
npm profile enable-2fa auth-and-writes
# scan the QR code with an authenticator app
# save the recovery codes somewhere safe
```

Verify:

```bash
npm profile get | grep tfa
# → tfa: auth-and-writes
```

Why `auth-and-writes` (not `auth-only`): blocks `npm publish` without a second factor. `auth-only` lets anyone who steals your session cookie publish.

If you ever rotate your npm token (CI publish), use a granular token scoped to the `capacitor-braze` package only.

---

## Step 5: Tag-release flow

After 0.1.0 lands, releases go via tags:

```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers the `release.yml` workflow which publishes to npm. The `NPM_TOKEN` GitHub secret must be a granular 2FA-bypass token (npm calls these "automation tokens") scoped to this package only. Set it via:

```bash
gh secret set NPM_TOKEN
# paste the token; it never appears in CI logs
```

---

## Verification checklist

After all steps are done, you should be able to confirm:

```bash
gh api repos/bma342/capacitor-braze/branches/main/protection \
  --jq '{enforce_admins: .enforce_admins.enabled, force_push: .allow_force_pushes.enabled, sig_required: .required_signatures.enabled, status_checks: .required_status_checks.contexts | length}'
```

Expected output:

```json
{
  "enforce_admins": false,
  "force_push": false,
  "sig_required": true,
  "status_checks": 8
}
```

Plus locally:

- `git log --show-signature -1` shows a "Good" signature on your most recent commit
- `npm profile get` shows `tfa: auth-and-writes`
- `gh secret list` shows `NPM_TOKEN` (set value not visible, that's expected)

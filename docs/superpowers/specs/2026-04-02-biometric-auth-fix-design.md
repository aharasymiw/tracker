# Biometric Authentication: Fix + Settings Enrollment

## Context

Trellis has a WebAuthn PRF biometric auth implementation that doesn't work reliably. The crypto layer (`src/lib/auth.ts`) is correct, but the UI has three bugs:

1. **Wrong capability check** — UI uses `isWebAuthnSupported()` (sync, checks for `PublicKeyCredential`) instead of `isPRFSupported()` (async, checks actual PRF capability). On devices that support WebAuthn but not PRF (older iOS, some Android), the biometric option appears but registration silently fails.
2. **State mismatch on failure** — `createVault` sets `authMethod: 'both'` before calling `registerBiometric()`. If registration fails, vault metadata says biometric is enabled but no PRF data exists. LockScreen shows a biometric button that always fails.
3. **No post-creation enrollment** — Users who create a password-only account have no way to add biometrics later from Settings.

## Design Decisions

- **Three auth modes for new users:** password-only, biometric-only, or both (password + biometric).
- Biometric-only has no recovery path — if the credential is lost (device reset), the vault is permanently inaccessible. Onboarding shows a warning and requires a confirmation checkbox before allowing biometric-only.
- Adding biometrics from Settings requires password confirmation (prevents unauthorized enrollment on unattended device). Settings enrollment always results in `'both'` since the user already has a password.
- Users can remove biometrics and revert to password-only.
- Devices without PRF support show the option greyed out with an explanation.

## Changes

### 1. AuthContext: async PRF detection + new methods

**File:** `src/contexts/AuthContext.tsx`

Replace `webAuthnSupported` (sync boolean) with `prfSupported` (async, `boolean | null` where null = still checking):

```typescript
const [prfSupported, setPrfSupported] = useState<boolean | null>(null)

useEffect(() => {
  isPRFSupported().then(setPrfSupported)
}, [])
```

Expose on context: `prfSupported: boolean | null` (replaces `webAuthnSupported`).

**Refactor `createVault(options)` to support three modes:**

```typescript
createVault(options: {
  password?: string
  withBiometric?: boolean
}): Promise<void>
```

- `{ password }` — password-only vault
- `{ password, withBiometric: true }` — both (attempt biometric, fall back to password-only on failure)
- `{ withBiometric: true }` — biometric-only vault (no password). Master key is wrapped only with the PRF key. If registration fails, vault creation fails entirely.

For `'both'` mode: set `authMethod: 'password'` initially, attempt registration, only upgrade to `'both'` if `registerBiometric()` returns non-null.

**Add `enableBiometric(password: string): Promise<boolean>`:**
- Verify password against stored vault meta (derive wrapping key, unwrap master key)
- Call `registerBiometric('trellis-user')`
- Wrap current in-memory master key with PRF key
- Update vault meta: add PRF fields, set `authMethod: 'both'`
- Return success/failure

**Add `disableBiometric(password: string): Promise<boolean>`:**
- Verify password
- Update vault meta: remove PRF fields, set `authMethod: 'password'`
- Return success/failure

### 2. Onboarding: three auth mode choices

**File:** `src/components/auth/Onboarding.tsx`

Replace the current password + optional biometric toggle with a flow that supports three modes:

- **When `prfSupported === true`:** Show auth method selector with three options:
  - **Password only** — current behavior, password fields shown
  - **Biometric only** — no password fields. Show warning: "If you reset your device, your data cannot be recovered." Require a confirmation checkbox ("I understand my data cannot be recovered if I lose access to this device") before the create button is enabled.
  - **Both** — password fields + biometric registration at creation time
- **When `prfSupported === false`:** Password-only flow. Show biometric option greyed out with "Your device doesn't support biometric unlock".
- **When `prfSupported === null`:** Hide biometric options (still loading)

### 3. Settings: biometric management section

**File:** `src/pages/SettingsPage.tsx`

New section in the Security area, after the stay-logged-in toggle:

**When `authMethod === 'password'` and `prfSupported === true`:**
- "Enable biometric unlock" button
- Clicking opens password confirmation input
- On correct password + successful registration: show success message
- On failure: show error message

**When `authMethod === 'both'`:**
- "Biometric unlock enabled" label with checkmark
- "Remove biometric" button
- Clicking opens password confirmation
- On correct password: removes PRF data, reverts to password-only

**When `authMethod === 'biometric'`:**
- "Biometric unlock enabled" label with checkmark
- No remove option (no password to fall back to)
- Optionally: "Add password" button to upgrade to `'both'` (future enhancement, out of scope for now)

**When `prfSupported === false`:**
- "Biometric unlock" label, greyed out
- "Your device doesn't support biometric unlock" explanation text

**When `prfSupported === null`:**
- Loading state or hidden

### 4. LockScreen: handle biometric-only mode

**File:** `src/components/auth/LockScreen.tsx`

- When `authMethod === 'biometric'`: show only the biometric unlock button, hide the password form entirely.
- When `authMethod === 'both'`: show both password form and biometric button (current behavior, already works).
- When `authMethod === 'password'`: show only password form (current behavior).

## Files to modify

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Async PRF detection, refactor `createVault` for 3 modes, add `enableBiometric`/`disableBiometric` |
| `src/components/auth/Onboarding.tsx` | Auth mode selector (password / biometric / both), PRF check, risk warning + confirmation |
| `src/components/auth/LockScreen.tsx` | Handle biometric-only mode (hide password form) |
| `src/pages/SettingsPage.tsx` | Add biometric enrollment/removal section |

## Platform coverage

All platforms use the same WebAuthn PRF API:
- **macOS:** Touch ID (fingerprint) via Safari/Chrome
- **iOS/iPadOS:** Face ID or Touch ID via Safari (requires iOS 18+)
- **Android:** Fingerprint or face unlock via Chrome (requires Chrome 116+)

## Verification

1. `vp check` — lint/format/typecheck pass
2. `vp test run` — existing tests pass
3. Manual: on a PRF-capable device, create a new vault with biometrics + password ("both"). Lock and unlock with biometric. Lock and unlock with password.
4. Manual: create a biometric-only vault. Verify warning and confirmation checkbox appear. Lock and unlock with biometric. Verify password form is hidden on lock screen.
5. Manual: create a password-only vault, go to Settings, enable biometrics. Lock and unlock with biometric.
6. Manual: in Settings (with `authMethod: 'both'`), remove biometrics. Verify biometric button disappears from lock screen.
7. Manual: on a device without PRF support, verify the biometric option appears greyed out with explanation.
8. Manual: simulate registration failure (e.g., cancel the biometric prompt during "both" mode) — verify vault is still created as password-only with appropriate error message.
9. Manual: simulate registration failure during biometric-only mode — verify vault creation fails with error message.

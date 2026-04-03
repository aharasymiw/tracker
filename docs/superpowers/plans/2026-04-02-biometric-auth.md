# Biometric Auth Fix + Settings Enrollment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken biometric auth (wrong capability check, state mismatch), support biometric-only vaults, and add post-creation biometric enrollment/removal in Settings.

**Architecture:** Replace sync `isWebAuthnSupported()` with async `isPRFSupported()` throughout. Refactor `createVault` to accept an options object supporting three modes (password, biometric, both). Add `enableBiometric`/`disableBiometric` methods to AuthContext for Settings management. Update Onboarding with a 3-way auth mode selector and LockScreen to handle biometric-only vaults.

**Tech Stack:** React, WebAuthn PRF, WebCrypto (AES-GCM, HKDF, PBKDF2), Vitest

**Spec:** `docs/superpowers/specs/2026-04-02-biometric-auth-fix-design.md`

---

## File Structure

| File                                  | Role                              | Action |
| ------------------------------------- | --------------------------------- | ------ |
| `src/contexts/AuthContext.tsx`        | Vault state machine, auth methods | Modify |
| `src/components/auth/Onboarding.tsx`  | Vault creation UI                 | Modify |
| `src/components/auth/LockScreen.tsx`  | Vault unlock UI                   | Modify |
| `src/pages/SettingsPage.tsx`          | Biometric enrollment/removal UI   | Modify |
| `tests/integration/auth-flow.test.ts` | Auth integration tests            | Modify |

---

### Task 1: Replace `webAuthnSupported` with async `prfSupported` in AuthContext

**Files:**

- Modify: `src/contexts/AuthContext.tsx`

- [ ] **Step 1: Update the context interface**

In `src/contexts/AuthContext.tsx`, replace `webAuthnSupported` with `prfSupported` in the `AuthContextValue` interface:

```typescript
interface AuthContextValue {
  vaultState: VaultState
  authMethod: AuthMethod | null
  unlock: (password: string) => Promise<boolean>
  unlockWithBiometric: () => Promise<boolean>
  lock: () => void
  createVault: (password: string, withBiometric?: boolean) => Promise<void>
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>
  masterKey: CryptoKey | null
  prfSupported: boolean | null
  setAutoLockConfig: (minutes: number, stayLoggedIn: boolean) => void
}
```

- [ ] **Step 2: Replace the sync check with async detection**

Replace:

```typescript
const webAuthnSupported = isWebAuthnSupported()
```

With:

```typescript
const [prfSupported, setPrfSupported] = useState<boolean | null>(null)

useEffect(() => {
  isPRFSupported().then(setPrfSupported)
}, [])
```

Add `isPRFSupported` to the imports from `@/lib/auth` and remove `isWebAuthnSupported`.

- [ ] **Step 3: Update the `createVault` function**

Replace the `webAuthnSupported` reference inside `createVault`:

```typescript
if (withBiometric && webAuthnSupported) {
```

With:

```typescript
if (withBiometric) {
```

(The caller is responsible for checking `prfSupported` before passing `withBiometric: true`.)

- [ ] **Step 4: Update the provider value**

Replace `webAuthnSupported` with `prfSupported` in the context provider value object.

- [ ] **Step 5: Run checks**

Run: `npx vp check`
Expected: type errors in `Onboarding.tsx` (it still references `webAuthnSupported`) — that's expected, we fix it in Task 3. AuthContext itself should have no errors.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "refactor: replace webAuthnSupported with async prfSupported in AuthContext"
```

---

### Task 2: Refactor `createVault` to support three auth modes + fix state mismatch

**Files:**

- Modify: `src/contexts/AuthContext.tsx`
- Test: `tests/integration/auth-flow.test.ts`

- [ ] **Step 1: Write failing test for biometric-only vault creation**

Add to `tests/integration/auth-flow.test.ts`:

```typescript
import { wrapMasterKey } from '@/lib/crypto'

describe('auth flow - biometric-only vault (simulated)', () => {
  it('master key wrapped only with PRF key is recoverable', async () => {
    // Simulate PRF output: a raw 32-byte key
    const prfOutput = crypto.getRandomValues(new Uint8Array(32))
    const keyMaterial = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, [
      'deriveKey',
    ])
    const prfKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(32),
        info: new TextEncoder().encode('trellis-wrap'),
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['wrapKey', 'unwrapKey']
    )

    // Create master key and wrap with PRF key only (no password)
    const masterKey = await generateMasterKey()
    const { encryptedMasterKey, masterKeyIV } = await wrapMasterKey(masterKey, prfKey)

    // Encrypt data
    const { iv, ciphertext } = await encrypt('biometric-only data', masterKey)

    // Simulate lock & unlock: re-derive same PRF key, unwrap master key
    const prfKey2 = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(32),
        info: new TextEncoder().encode('trellis-wrap'),
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['wrapKey', 'unwrapKey']
    )
    const unlockedKey = await unwrapMasterKey(encryptedMasterKey, masterKeyIV, prfKey2)
    const decrypted = await decrypt(ciphertext, iv, unlockedKey)
    expect(decrypted).toBe('biometric-only data')
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vp test run tests/integration/auth-flow.test.ts`
Expected: PASS (this test exercises the crypto layer which already works)

- [ ] **Step 3: Refactor `createVault` signature and implementation**

In `src/contexts/AuthContext.tsx`, change the `createVault` signature in the interface:

```typescript
createVault: (options: { password?: string; withBiometric?: boolean }) => Promise<void>
```

Refactor the implementation:

```typescript
const createVault = useCallback(
  async (options: { password?: string; withBiometric?: boolean }): Promise<void> => {
    const { password, withBiometric } = options
    const masterKey = await generateMasterKey()

    const meta: VaultMeta = {
      version: 1,
      authMethod: 'password',
      passwordSalt: '',
      encryptedMasterKey: '',
      masterKeyIV: '',
      createdAt: new Date().toISOString(),
    }

    // Password wrapping
    if (password) {
      const salt = await generateSalt()
      const wrappingKey = await deriveKeyFromPassword(password, salt)
      const { encryptedMasterKey, masterKeyIV } = await wrapMasterKey(masterKey, wrappingKey)
      meta.passwordSalt = salt
      meta.encryptedMasterKey = encryptedMasterKey
      meta.masterKeyIV = masterKeyIV
    }

    // Biometric wrapping
    if (withBiometric) {
      const result = await registerBiometric('trellis-user')
      if (result) {
        const { encryptedMasterKey: prfEnc, masterKeyIV: prfIV } = await wrapMasterKey(
          masterKey,
          result.prfKey
        )
        meta.prfEncryptedMasterKey = prfEnc
        meta.prfMasterKeyIV = prfIV
        meta.prfCredentialId = result.credentialId
      } else if (!password) {
        // Biometric-only mode: registration is required
        throw new Error('Biometric registration failed')
      }
      // If password+biometric and registration failed, fall back to password-only silently
    }

    // Determine authMethod from what actually succeeded
    const hasPassword = !!meta.passwordSalt
    const hasBiometric = !!meta.prfCredentialId
    if (hasPassword && hasBiometric) {
      meta.authMethod = 'both'
    } else if (hasBiometric) {
      meta.authMethod = 'biometric'
    } else {
      meta.authMethod = 'password'
    }

    await saveVaultMeta(meta)
    masterKeyRef.current = masterKey
    setMasterKeyVersion((v) => v + 1)
    setAuthMethod(meta.authMethod)
    setVaultState('unlocked')
  },
  []
)
```

- [ ] **Step 4: Run checks**

Run: `npx vp check`
Expected: type errors in `Onboarding.tsx` (still uses old `createVault(password, withBiometric)` call signature) — expected, fixed in Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AuthContext.tsx tests/integration/auth-flow.test.ts
git commit -m "refactor: createVault supports password/biometric/both modes, fix state mismatch"
```

---

### Task 3: Add `enableBiometric` and `disableBiometric` to AuthContext

**Files:**

- Modify: `src/contexts/AuthContext.tsx`

- [ ] **Step 1: Add `enableBiometric` to the interface and implementation**

Add to the `AuthContextValue` interface:

```typescript
enableBiometric: (password: string) => Promise<boolean>
disableBiometric: (password: string) => Promise<boolean>
```

Implement `enableBiometric`:

```typescript
const enableBiometric = useCallback(async (password: string): Promise<boolean> => {
  try {
    const meta = await getVaultMeta()
    if (!meta || !masterKeyRef.current) return false
    // Verify password
    const wrappingKey = await deriveKeyFromPassword(password, meta.passwordSalt)
    await unwrapMasterKey(meta.encryptedMasterKey, meta.masterKeyIV, wrappingKey)
    // Register biometric
    const result = await registerBiometric('trellis-user')
    if (!result) return false
    // Wrap master key with PRF key
    const { encryptedMasterKey: prfEnc, masterKeyIV: prfIV } = await wrapMasterKey(
      masterKeyRef.current,
      result.prfKey
    )
    // Update vault meta
    await saveVaultMeta({
      ...meta,
      authMethod: 'both',
      prfEncryptedMasterKey: prfEnc,
      prfMasterKeyIV: prfIV,
      prfCredentialId: result.credentialId,
    })
    setAuthMethod('both')
    return true
  } catch {
    return false
  }
}, [])
```

- [ ] **Step 2: Implement `disableBiometric`**

```typescript
const disableBiometric = useCallback(async (password: string): Promise<boolean> => {
  try {
    const meta = await getVaultMeta()
    if (!meta) return false
    // Verify password
    const wrappingKey = await deriveKeyFromPassword(password, meta.passwordSalt)
    await unwrapMasterKey(meta.encryptedMasterKey, meta.masterKeyIV, wrappingKey)
    // Remove PRF data from vault meta
    const updated: VaultMeta = {
      ...meta,
      authMethod: 'password',
    }
    delete updated.prfEncryptedMasterKey
    delete updated.prfMasterKeyIV
    delete updated.prfCredentialId
    await saveVaultMeta(updated)
    setAuthMethod('password')
    return true
  } catch {
    return false
  }
}, [])
```

- [ ] **Step 3: Add to provider value**

Add `enableBiometric` and `disableBiometric` to the context provider value object.

- [ ] **Step 4: Run checks**

Run: `npx vp check`
Expected: may still have errors from Onboarding — that's Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat: add enableBiometric and disableBiometric methods to AuthContext"
```

---

### Task 4: Update Onboarding for three auth modes

**Files:**

- Modify: `src/components/auth/Onboarding.tsx`

- [ ] **Step 1: Rewrite Onboarding component**

Replace the entire content of `src/components/auth/Onboarding.tsx`:

```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { Fingerprint, KeyRound, Loader2, ShieldAlert } from 'lucide-react'

type AuthMode = 'password' | 'biometric' | 'both'

export function Onboarding() {
  const { createVault, prfSupported } = useAuth()
  const [step, setStep] = useState<'welcome' | 'setup'>('welcome')
  const [authMode, setAuthMode] = useState<AuthMode>('password')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [riskAcknowledged, setRiskAcknowledged] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const needsPassword = authMode === 'password' || authMode === 'both'
  const needsBiometric = authMode === 'biometric' || authMode === 'both'

  const canCreate =
    !loading &&
    (needsPassword ? password.length >= 8 && password === confirm : true) &&
    (authMode === 'biometric' ? riskAcknowledged : true)

  const handleCreate = async () => {
    if (needsPassword) {
      if (password.length < 8) {
        setError('Password must be at least 8 characters')
        return
      }
      if (password !== confirm) {
        setError('Passwords do not match')
        return
      }
    }
    setError('')
    setLoading(true)
    try {
      await createVault({
        password: needsPassword ? password : undefined,
        withBiometric: needsBiometric,
      })
    } catch {
      setError(
        authMode === 'biometric'
          ? 'Biometric registration failed. Please try again.'
          : 'Failed to create vault. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  if (step === 'welcome') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6 text-center">
        <div className="space-y-2">
          <h1 className="font-serif text-4xl">Trellis</h1>
          <p className="text-muted-foreground">Track mindfully. Understand your patterns.</p>
        </div>
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground max-w-xs">
          Your data never leaves this device. Everything is encrypted locally.
        </div>
        <Button size="lg" className="w-full max-w-xs" onClick={() => setStep('setup')}>
          Get Started
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h2 className="font-serif text-2xl">Create your vault</h2>
          <p className="text-sm text-muted-foreground">Choose how to secure your data</p>
        </div>

        <div className="space-y-4">
          {/* Auth mode selector */}
          <div className="space-y-2">
            <AuthModeButton
              active={authMode === 'password'}
              onClick={() => {
                setAuthMode('password')
                setRiskAcknowledged(false)
              }}
              icon={<KeyRound size={20} />}
              label="Password only"
            />
            <AuthModeButton
              active={authMode === 'both'}
              onClick={() => {
                setAuthMode('both')
                setRiskAcknowledged(false)
              }}
              icon={<Fingerprint size={20} />}
              label="Password + biometric"
              disabled={prfSupported === false}
              disabledReason="Your device doesn't support biometric unlock"
            />
            <AuthModeButton
              active={authMode === 'biometric'}
              onClick={() => setAuthMode('biometric')}
              icon={<Fingerprint size={20} />}
              label="Biometric only"
              disabled={prfSupported === false}
              disabledReason="Your device doesn't support biometric unlock"
            />
          </div>

          {/* Password fields */}
          {needsPassword && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="Repeat password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canCreate && handleCreate()}
                />
              </div>
            </div>
          )}

          {/* Biometric-only risk warning */}
          {authMode === 'biometric' && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                <ShieldAlert size={18} className="mt-0.5 shrink-0" />
                <span>
                  If you reset your device, your data cannot be recovered. There is no password
                  backup.
                </span>
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={riskAcknowledged}
                  onChange={(e) => setRiskAcknowledged(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-muted-foreground">
                  I understand my data cannot be recovered if I lose access to this device
                </span>
              </label>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="w-full" onClick={handleCreate} disabled={!canCreate}>
            {loading ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" /> Creating vault…
              </>
            ) : (
              'Create vault'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function AuthModeButton({
  active,
  onClick,
  icon,
  label,
  disabled,
  disabledReason,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  disabled?: boolean
  disabledReason?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : active
            ? 'border-primary bg-primary/5 text-primary'
            : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      <div>
        <span>{label}</span>
        {disabled && disabledReason && (
          <p className="text-xs text-muted-foreground mt-0.5">{disabledReason}</p>
        )}
      </div>
    </button>
  )
}
```

- [ ] **Step 2: Run checks**

Run: `npx vp check`
Expected: PASS (no type errors now that Onboarding uses the new `createVault` signature and `prfSupported`)

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/Onboarding.tsx
git commit -m "feat: onboarding supports password/biometric/both with risk warning"
```

---

### Task 5: Update LockScreen for biometric-only mode

**Files:**

- Modify: `src/components/auth/LockScreen.tsx`

- [ ] **Step 1: Update LockScreen to handle biometric-only**

Replace the content of `src/components/auth/LockScreen.tsx`:

```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { Fingerprint, Loader2 } from 'lucide-react'

export function LockScreen() {
  const { unlock, unlockWithBiometric, authMethod } = useAuth()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const showPassword = authMethod === 'password' || authMethod === 'both'
  const showBiometric = authMethod === 'biometric' || authMethod === 'both'

  const handleUnlock = async () => {
    setLoading(true)
    setError('')
    const ok = await unlock(password)
    setLoading(false)
    if (!ok) setError('Incorrect password')
  }

  const handleBiometric = async () => {
    setLoading(true)
    setError('')
    const ok = await unlockWithBiometric()
    setLoading(false)
    if (!ok) {
      setError(
        showPassword
          ? 'Biometric unlock failed. Try your password.'
          : 'Biometric unlock failed. Please try again.'
      )
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-serif text-3xl">Trellis</h1>
          <p className="text-sm text-muted-foreground">
            {showPassword ? 'Enter your password to continue' : 'Use biometric to unlock'}
          </p>
        </div>

        <div className="space-y-4">
          {showPassword && (
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Your vault password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                autoFocus
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {showPassword && (
            <Button className="w-full" onClick={handleUnlock} disabled={loading || !password}>
              {loading ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" /> Unlocking…
                </>
              ) : (
                'Unlock'
              )}
            </Button>
          )}

          {showBiometric && (
            <Button
              variant={showPassword ? 'outline' : 'default'}
              className="w-full"
              onClick={handleBiometric}
              disabled={loading}
            >
              {loading && !showPassword ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" /> Unlocking…
                </>
              ) : (
                <>
                  <Fingerprint size={16} className="mr-2" />
                  Use biometric
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run checks**

Run: `npx vp check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/LockScreen.tsx
git commit -m "feat: LockScreen handles biometric-only mode"
```

---

### Task 6: Add biometric management to Settings

**Files:**

- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add biometric section to SettingsPage**

In `src/pages/SettingsPage.tsx`, add the import for `useAuth` fields and icons at the top. The file already imports `useAuth` — update it and add new icons:

Add `Fingerprint, Check` to the lucide-react imports (add this import line since the file doesn't currently import from lucide-react):

```typescript
import { Fingerprint, Check } from 'lucide-react'
```

Add new state variables inside the component, after the existing password state:

```typescript
const { changePassword, authMethod, prfSupported, enableBiometric, disableBiometric } = useAuth()
const [enablingBio, setEnablingBio] = useState(false)
const [bioPassword, setBioPassword] = useState('')
const [bioError, setBioError] = useState('')
const [bioSuccess, setBioSuccess] = useState(false)
const [bioLoading, setBioLoading] = useState(false)
const [removingBio, setRemovingBio] = useState(false)
const [removePassword, setRemovePassword] = useState('')
const [removeError, setRemoveError] = useState('')
```

Add handler functions:

```typescript
const handleEnableBiometric = async () => {
  setBioLoading(true)
  setBioError('')
  const ok = await enableBiometric(bioPassword)
  setBioLoading(false)
  if (ok) {
    setBioSuccess(true)
    setEnablingBio(false)
    setBioPassword('')
    setTimeout(() => setBioSuccess(false), 3000)
  } else {
    setBioError('Incorrect password or biometric registration failed')
  }
}

const handleDisableBiometric = async () => {
  setBioLoading(true)
  setRemoveError('')
  const ok = await disableBiometric(removePassword)
  setBioLoading(false)
  if (ok) {
    setRemovingBio(false)
    setRemovePassword('')
  } else {
    setRemoveError('Incorrect password')
  }
}
```

- [ ] **Step 2: Add the biometric section JSX**

Add after the change password `</div>` closing tag (after the `{pwSuccess && ...}` line, before `</section>`):

```tsx
{
  /* Biometric */
}
;<div className="pt-2 border-t">
  {authMethod === 'biometric' && (
    <div className="flex items-center gap-2 text-sm text-primary">
      <Fingerprint size={16} />
      <span>Biometric unlock enabled</span>
      <Check size={16} className="ml-auto" />
    </div>
  )}

  {authMethod === 'both' && !removingBio && (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-primary">
        <Fingerprint size={16} />
        <span>Biometric unlock enabled</span>
        <Check size={16} className="ml-auto" />
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={() => setRemovingBio(true)}>
        Remove biometric
      </Button>
    </div>
  )}

  {authMethod === 'both' && removingBio && (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Enter your password to remove biometric unlock
      </p>
      <Input
        type="password"
        placeholder="Current password"
        value={removePassword}
        onChange={(e) => setRemovePassword(e.target.value)}
      />
      {removeError && <p className="text-xs text-destructive">{removeError}</p>}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setRemovingBio(false)
            setRemoveError('')
          }}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={handleDisableBiometric} disabled={bioLoading || !removePassword}>
          {bioLoading ? 'Removing…' : 'Remove'}
        </Button>
      </div>
    </div>
  )}

  {authMethod === 'password' && prfSupported === true && !enablingBio && (
    <>
      <Button variant="outline" size="sm" className="w-full" onClick={() => setEnablingBio(true)}>
        <Fingerprint size={16} className="mr-2" />
        Enable biometric unlock
      </Button>
      {bioSuccess && <p className="text-xs text-primary mt-2">Biometric unlock enabled</p>}
    </>
  )}

  {authMethod === 'password' && prfSupported === true && enablingBio && (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Enter your password to enable biometric unlock
      </p>
      <Input
        type="password"
        placeholder="Current password"
        value={bioPassword}
        onChange={(e) => setBioPassword(e.target.value)}
      />
      {bioError && <p className="text-xs text-destructive">{bioError}</p>}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEnablingBio(false)
            setBioError('')
          }}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={handleEnableBiometric} disabled={bioLoading || !bioPassword}>
          {bioLoading ? 'Enabling…' : 'Enable'}
        </Button>
      </div>
    </div>
  )}

  {authMethod === 'password' && prfSupported === false && (
    <div className="flex items-center gap-2 text-sm opacity-40">
      <Fingerprint size={16} />
      <div>
        <span>Biometric unlock</span>
        <p className="text-xs text-muted-foreground">
          Your device doesn't support biometric unlock
        </p>
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 3: Run checks and fix formatting**

Run: `npx vp check --fix`
Then: `npx vp check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat: add biometric enable/disable to Settings"
```

---

### Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run all checks**

Run: `npx vp check`
Expected: PASS (0 errors, only pre-existing warnings)

- [ ] **Step 2: Run all tests**

Run: `npx vp test run`
Expected: all tests pass (existing 37 + 1 new = 38)

- [ ] **Step 3: Commit any remaining changes**

If formatting was auto-fixed, commit those changes:

```bash
git add -A
git commit -m "style: auto-format"
```

- [ ] **Step 4: Manual verification checklist**

Run `npx vp dev` and test on device:

1. New vault with password only — works as before
2. New vault with password + biometric — biometric prompt appears, both unlock methods work
3. New vault with biometric only — warning shown, checkbox required, biometric prompt appears, lock screen shows only biometric button
4. Settings: enable biometric on password-only account — password confirmation, biometric prompt, success
5. Settings: remove biometric — password confirmation, biometric button disappears from lock screen
6. Device without PRF — biometric options greyed out with explanation

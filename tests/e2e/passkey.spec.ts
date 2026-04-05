import { Buffer } from 'node:buffer'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { chromium, expect, test } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://127.0.0.1:4173'
type CapabilityMode = 'confirmed' | 'tentative'

function makeCredentialFixtures() {
  const credentialId = Buffer.from('trellis-passkey-credential').toString('base64url')
  const prfOutput = Buffer.alloc(32, 7).toString('base64url')

  return { credentialId, prfOutput }
}

async function installPasskeyHarness(
  page: import('@playwright/test').Page,
  capabilityMode: CapabilityMode
) {
  const fixtures = makeCredentialFixtures()

  await page.context().addInitScript(
    ({ credentialId, prfOutput, capabilityMode }) => {
      const base64UrlToBuffer = (value: string) => {
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
        const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
        const binary = atob(normalized + padding)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index)
        }
        return bytes.buffer
      }

      const createCredential = () => ({
        rawId: base64UrlToBuffer(credentialId),
        id: credentialId,
        type: 'public-key',
        getClientExtensionResults: () => ({
          prf: {
            enabled: true,
          },
        }),
      })

      const getCredential = () => ({
        rawId: base64UrlToBuffer(credentialId),
        id: credentialId,
        type: 'public-key',
        getClientExtensionResults: () => ({
          prf: {
            results: {
              first: base64UrlToBuffer(prfOutput),
            },
          },
        }),
      })

      class MockPublicKeyCredential {}
      Object.defineProperty(
        MockPublicKeyCredential,
        'isUserVerifyingPlatformAuthenticatorAvailable',
        {
          value: async () => true,
        }
      )
      Object.defineProperty(
        MockPublicKeyCredential,
        'getClientCapabilities',
        capabilityMode === 'confirmed'
          ? {
              value: async () => ({
                passkeyPlatformAuthenticator: true,
                'extension:prf': true,
              }),
            }
          : {
              value: async () => ({
                passkeyPlatformAuthenticator: true,
              }),
            }
      )

      Object.defineProperty(window, 'PublicKeyCredential', {
        configurable: true,
        value: MockPublicKeyCredential,
      })

      const credentials = {
        create: async () => createCredential(),
        get: async () => getCredential(),
      }

      try {
        Object.defineProperty(Navigator.prototype, 'credentials', {
          configurable: true,
          get: () => credentials,
        })
      } catch {
        Object.defineProperty(navigator, 'credentials', {
          configurable: true,
          value: credentials,
        })
      }
    },
    { ...fixtures, capabilityMode }
  )
}

async function enableVirtualAuthenticator(page: import('@playwright/test').Page) {
  try {
    const client = await page.context().newCDPSession(page)
    await client.send('WebAuthn.enable', { enableUI: true })
    await client.send('WebAuthn.addVirtualAuthenticator', {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    })
  } catch {
    // Best-effort only. The deterministic WebAuthn harness below still exercises the app.
  }
}

async function launchPersistentApp(userDataDir: string, capabilityMode: CapabilityMode) {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
  })
  const page = await context.newPage()
  await installPasskeyHarness(page, capabilityMode)
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  void enableVirtualAuthenticator(page).catch(() => {})
  return { context, page }
}

for (const capabilityMode of ['confirmed', 'tentative'] as const) {
  test(`passkey signup unlocks the vault and stay logged in survives reload and browser restart (${capabilityMode})`, async () => {
    test.setTimeout(120_000)

    const userDataDir = mkdtempSync(join(tmpdir(), `trellis-passkey-e2e-${capabilityMode}-`))
    let { context, page } = await launchPersistentApp(userDataDir, capabilityMode)

    await page.getByRole('button', { name: 'Get Started' }).click()
    const chooseHeading = page.getByRole('heading', { name: 'Choose how to unlock Trellis' })
    const passkeyFallback = page.getByRole('button', { name: 'Prefer fingerprint / Face ID?' })
    const onboardingBranch = await Promise.race([
      chooseHeading.waitFor({ state: 'visible' }).then(() => 'choose'),
      passkeyFallback.waitFor({ state: 'visible' }).then(() => 'password'),
    ])

    if (onboardingBranch === 'choose') {
      await page.getByRole('button', { name: 'Use fingerprint / Face ID' }).click()
    } else {
      await passkeyFallback.click()
    }

    await page.getByLabel('Recovery password').fill('recovery-password-123')
    await page.getByLabel('Confirm password').fill('recovery-password-123')
    await page.getByRole('button', { name: 'Set up fingerprint / Face ID' }).click()

    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Log' })).toBeVisible()

    await page.getByRole('button', { name: 'Lock vault' }).click()
    await expect(
      page.getByRole('button', { name: 'Unlock with fingerprint / Face ID' })
    ).toBeVisible()
    await page.getByRole('button', { name: 'Unlock with fingerprint / Face ID' }).click()
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()

    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    const stayLoggedInSwitch = page
      .locator('section')
      .filter({ hasText: 'Stay logged in' })
      .getByRole('switch')
    await stayLoggedInSwitch.click()
    await expect(stayLoggedInSwitch).toBeChecked()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/settings$/)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(stayLoggedInSwitch).toBeChecked()

    await context.close()

    ;({ context, page } = await launchPersistentApp(userDataDir, capabilityMode))

    // Browser-restart validation is intentionally simple here: we relaunch Chromium with the same
    // userDataDir and assert the app comes back already unlocked on a secure route.
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(
      page.locator('section').filter({ hasText: 'Stay logged in' }).getByRole('switch')
    ).toBeChecked()

    await context.close()
  })
}

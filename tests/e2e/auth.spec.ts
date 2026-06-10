import { test, expect, type Page } from '@playwright/test'

// Auth flows in a real browser: onboarding, manual lock propagating across
// tabs (BroadcastChannel), wrong-password handling, and idle auto-lock via a
// mocked clock.

const PASSWORD = 'password-123'

async function createVault(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Get Started' }).click()
  await page.locator('#password').fill(PASSWORD)
  await page.locator('#confirm').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create vault' }).click()
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
}

test('onboarding, cross-tab lock, and unlock', async ({ page, context }) => {
  await createVault(page)

  // A second tab starts locked (no stay-logged-in) and unlocks independently.
  const tab2 = await context.newPage()
  await tab2.goto('/')
  await expect(tab2.getByText('Enter your password to continue')).toBeVisible()
  await tab2.locator('#password').fill(PASSWORD)
  await tab2.getByRole('button', { name: 'Unlock with password' }).click()
  await expect(tab2.getByRole('link', { name: 'Settings' })).toBeVisible()

  // Explicit lock in tab 1 locks tab 2 too, without any interaction there.
  await page.getByRole('button', { name: 'Lock vault' }).click()
  await expect(page.getByText('Enter your password to continue')).toBeVisible()
  await expect(tab2.getByText('Enter your password to continue')).toBeVisible()

  // Wrong password errors; the right one unlocks.
  await page.locator('#password').fill('wrong-password')
  await page.getByRole('button', { name: 'Unlock with password' }).click()
  await expect(page.getByText('Incorrect password')).toBeVisible()
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Unlock with password' }).click()
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
})

test('idle auto-lock fires after the configured window', async ({ page }) => {
  await page.clock.install()
  await createVault(page)

  // Default auto-lock is 5 minutes; with no activity the vault locks itself.
  await page.clock.fastForward('06:00')
  await expect(page.getByText('Enter your password to continue')).toBeVisible()
})

test('reload without stay-logged-in lands on the lock screen', async ({ page }) => {
  await createVault(page)
  await page.reload()
  await expect(page.getByText('Enter your password to continue')).toBeVisible()
})

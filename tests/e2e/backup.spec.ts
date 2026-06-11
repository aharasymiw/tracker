import { test, expect } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'

// End-to-end smoke test for the local backup feature in a real browser. Unlike
// the jsdom integration tests, this exercises the parts only a browser can: the
// Blob/anchor download, a real file picker upload, and browser IndexedDB +
// WebCrypto. The vault is seeded via the onboarding "restore from backup" path
// so we never have to script the Log entry form.

const SEED = {
  app: 'lesslately',
  version: 1,
  exportedAt: '2026-06-09T00:00:00.000Z',
  encrypted: false,
  entries: [
    {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      type: 'flower',
      amount: 1.5,
      unit: 'hits',
      socialContext: 'solo',
      timestamp: '2026-06-05T14:30:00.000Z',
      note: 'after work',
      createdAt: '2026-06-05T14:30:00.000Z',
      updatedAt: '2026-06-05T14:30:00.000Z',
    },
    {
      id: 'd3ffcd88-1a2b-4c4d-9e6f-7a8b9c0d1e41',
      type: 'vape',
      amount: 2,
      unit: 'hits',
      socialContext: 'social',
      timestamp: '2026-06-06T20:00:00.000Z',
      note: 'movie night',
      createdAt: '2026-06-06T20:00:00.000Z',
      updatedAt: '2026-06-06T20:00:00.000Z',
    },
  ],
  goals: [
    {
      id: 'b1ffcd88-1a2b-4c4d-8e6f-7a8b9c0d1e2f',
      type: 'daily',
      maxAmount: 3,
      unit: 'hits',
      reductionMode: false,
      startDate: '2026-06-01T00:00:00.000Z',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  ],
  settings: { theme: 'system', autoLockMinutes: 5 },
}

test('export → re-import round-trip with conflict resolution', async ({ page }) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lesslately-e2e-'))
  const seedPath = path.join(tmpDir, 'seed.json')
  await fs.writeFile(seedPath, JSON.stringify(SEED))

  // --- Seed a brand-new vault via onboarding restore -----------------------
  await page.goto('/')
  await expect(page.getByText('Restore from a backup')).toBeVisible()

  // Feed the file straight to the hidden input (clicking the button would open
  // the OS picker, which the test can't drive).
  await page.locator('input[type="file"]').setInputFiles(seedPath)
  await expect(page.getByText(/Restoring/)).toBeVisible()

  // Restoring a backup drops straight onto the password form.
  const passwordInput = page.locator('#password')
  await expect(passwordInput).toBeVisible()
  await passwordInput.fill('password-123')
  await page.locator('#confirm').fill('password-123')
  await page.getByRole('button', { name: 'Create vault' }).click()

  // App is unlocked once the header (with the Settings link) renders.
  const settingsLink = page.getByRole('link', { name: 'Settings' })
  await expect(settingsLink).toBeVisible()
  await settingsLink.click()

  // --- Export the seeded vault as plaintext JSON ---------------------------
  const exportJson = page.getByRole('button', { name: 'Export JSON' })
  await expect(exportJson).toBeEnabled()
  await exportJson.click()

  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download', exact: true }).click(),
  ])
  const exportPath = path.join(tmpDir, 'export.json')
  await jsonDownload.saveAs(exportPath)

  const exported = JSON.parse(await fs.readFile(exportPath, 'utf8'))
  expect(exported.encrypted).toBe(false)
  expect(exported.entries).toHaveLength(2)
  expect(exported.goals).toHaveLength(1)
  // Notes round-trip through the export.
  expect(exported.entries.map((e: { note: string }) => e.note).sort()).toEqual([
    'after work',
    'movie night',
  ])

  // --- Export entries as CSV ----------------------------------------------
  await page.getByRole('button', { name: 'Export CSV' }).click()
  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ])
  const csvPath = path.join(tmpDir, 'entries.csv')
  await csvDownload.saveAs(csvPath)
  const csv = await fs.readFile(csvPath, 'utf8')
  expect(csv.split(/\r?\n/)).toHaveLength(3) // header + 2 entries

  // --- Re-import the JSON: every record id collides → resolve as overwrite --
  await page.locator('input[type="file"]').setInputFiles(exportPath)
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByText(/Conflict 1 of/)).toBeVisible()
  await page.getByRole('switch').click() // apply my choice to all remaining
  await page.getByRole('button', { name: 'Overwrite with incoming' }).click()

  await expect(page.getByText('Import complete')).toBeVisible()
  await expect(page.getByText(/overwrote 3/)).toBeVisible()

  // Finish and confirm the data survived on the Journal tab. Overwrite (not
  // copy) means exactly one of each entry — no duplicates.
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('link', { name: 'Journal' }).click()
  await expect(page.getByText('Flower')).toHaveCount(1)
  await expect(page.getByText('Vape')).toHaveCount(1)

  await fs.rm(tmpDir, { recursive: true, force: true })
})

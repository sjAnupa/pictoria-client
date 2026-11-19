import { expect, test } from '@playwright/test'
import { ADMIN_USER, installApiMocks, seedAuth } from './helpers'

test('admin profile menu opens and logs out', async ({ page }) => {
  await seedAuth(page, ADMIN_USER)
  await installApiMocks(page, { user: ADMIN_USER })

  await page.goto('/admin')
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Account menu' }).click()
  await expect(page.getByRole('menuitem', { name: 'Log out' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Log out' }).click()

  await expect(page.getByText('Sign out?')).toBeVisible()
  await page.getByRole('button', { name: 'Yes, sign out' }).click()

  await expect(page).toHaveURL(/\/login/)
  expect(await page.evaluate(() => localStorage.getItem('pictoriya_token'))).toBeNull()
})

test('admin sidebar logout opens the same confirm dialog', async ({ page }) => {
  await seedAuth(page, ADMIN_USER)
  await installApiMocks(page, { user: ADMIN_USER })
  await page.goto('/admin')
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByText('Sign out?')).toBeVisible()
})

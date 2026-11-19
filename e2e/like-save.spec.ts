import { expect, test } from '@playwright/test'
import { READER_USER, installApiMocks, seedAuth } from './helpers'

test('like and save flip immediately and send the desired state', async ({ page }) => {
  await seedAuth(page, READER_USER)
  const { likeBodies, saveBodies } = await installApiMocks(page, { user: READER_USER })

  await page.goto('/books/cherry-blossom-letters')
  await expect(page.getByRole('heading', { name: 'Cherry Blossom Letters' })).toBeVisible()

  const likeBtn = page.getByRole('button', { name: /^Like$/ })
  await likeBtn.click()
  await expect(page.getByRole('button', { name: /^Liked$/ })).toBeVisible()
  await expect.poll(() => likeBodies.length).toBe(1)
  expect(likeBodies[0]).toEqual({ liked: true })

  const saveBtn = page.getByRole('button', { name: /^Save$/ })
  await saveBtn.click()
  await expect(page.getByRole('button', { name: /^Saved$/ })).toBeVisible()
  await expect.poll(() => saveBodies.length).toBe(1)
  expect(saveBodies[0]).toEqual({ saved: true })
})

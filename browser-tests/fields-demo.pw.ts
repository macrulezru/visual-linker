import { expect, test } from '@playwright/test'

test('the Fields demo draws a port on every visible row and keeps row buttons working', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Fields' }).click()
  await page.waitForSelector('circle.vl-port')
  expect(await page.locator('circle.vl-port').count()).toBeGreaterThan(10)
  await page.locator('.row button').first().click()
  await expect(page.locator('.status')).toContainText('last removed: source_field_1')
  expect(await page.locator('circle.vl-port--source').count()).toBeGreaterThan(0)
  expect(await page.locator('circle.vl-port--target').count()).toBeGreaterThan(0)
  expect(errors).toEqual([])
})

#!/usr/bin/env node
/**
 * Recaptures docs/screenshots/ from a running AURUM instance.
 *
 * One-time setup:
 *   npm i -D playwright && npx playwright install chromium
 *
 * Usage:
 *   npm run screenshots                       # against the live deployment
 *   BASE_URL=http://localhost:3000 npm run screenshots
 *
 * Shots are taken at 1440x900 in light mode. Nothing here signs in — every
 * page captured is publicly reachable, so this is safe to run against prod.
 */

import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'docs/screenshots')
const BASE_URL = (process.env.BASE_URL || 'https://full-stack-e-commerce-kabeho.vercel.app').replace(/\/$/, '')

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.error(
    '\n  playwright is not installed. Run this once:\n\n' +
      '    npm i -D playwright && npx playwright install chromium\n'
  )
  process.exit(1)
}

/** @type {{ name: string, path: string | null, prepare?: (page: import('playwright').Page) => Promise<void> }[]} */
const SHOTS = [
  { name: 'storefront', path: '/' },
  { name: 'shop-filters', path: '/shop' },
  {
    name: 'product-detail',
    path: null, // discovered from the shop grid so no slug is hard-coded
    async prepare(page) {
      await page.goto(`${BASE_URL}/shop`, { waitUntil: 'networkidle' })
      const card = page.locator('a[href*="/product"]').first()
      await card.waitFor({ state: 'visible', timeout: 15_000 })
      await card.click()
      await page.waitForLoadState('networkidle')
    },
  },
  {
    name: 'checkout-momo',
    path: null,
    async prepare(page) {
      await page.goto(`${BASE_URL}/checkout`, { waitUntil: 'networkidle' })
      // Select a mobile-money rail if the picker is on the page.
      const momo = page
        .getByText(/mtn|mobile money|momo/i)
        .filter({ has: page.locator('input, button, [role="radio"]') })
        .first()
      if (await momo.count()) await momo.click().catch(() => {})
    },
  },
]

await mkdir(OUT, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
})

let ok = 0
for (const shot of SHOTS) {
  const page = await context.newPage()
  try {
    if (shot.prepare) {
      await shot.prepare(page)
    } else {
      await page.goto(`${BASE_URL}${shot.path}`, { waitUntil: 'networkidle', timeout: 45_000 })
    }
    // Let fonts settle and lazy images resolve before shooting.
    await page.evaluate(() => document.fonts?.ready)
    await page.evaluate(async () => {
      await new Promise((r) => {
        let y = 0
        const step = () => {
          window.scrollTo(0, (y += 600))
          if (y < document.body.scrollHeight) requestAnimationFrame(step)
          else {
            window.scrollTo(0, 0)
            setTimeout(r, 400)
          }
        }
        step()
      })
    })
    await page.waitForTimeout(600)
    await page.screenshot({ path: resolve(OUT, `${shot.name}.png`) })
    console.log(`  captured  docs/screenshots/${shot.name}.png`)
    ok++
  } catch (err) {
    console.warn(`  skipped   ${shot.name} — ${err.message.split('\n')[0]}`)
  } finally {
    await page.close()
  }
}

await browser.close()
console.log(`\n  ${ok}/${SHOTS.length} screenshots written to docs/screenshots/\n`)

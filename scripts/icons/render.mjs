import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const mode = process.argv[2] || 'tile'
const out = process.argv[3] || `/tmp/lesslately-icons/render-${mode}.png`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } })
await page.goto('file://' + path.join(here, 'icon.html') + `?mode=${mode}`)
await page.waitForFunction(() => document.title === 'ready')
await page.locator('#tile').screenshot({ path: out, omitBackground: true })
await browser.close()
console.log('rendered', mode, '->', out)

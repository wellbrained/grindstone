// Renders the logo into the raster files in public/ (docs/adr/0005-logo.md):
// favicon.ico (16, 32, 48), apple-touch-icon.png (180), icon-192.png, icon-512.png, og-image.png (1200x630).
// Run: node scripts/brand/generate-icons.mjs   (uses Playwright's Chromium; needs internet for the Tektur font)
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const out = path => fileURLToPath(new URL(`../../public/${path}`, import.meta.url))
const INK = '#eceff4'
const EMBER = '#ff8a3d'
const TILE = '#1d2129'

// The full mark; `simple` drops the inner grid rings and the dots so it stays clear at 16 px.
const mark = (simple = false) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke-linejoin="round" width="100%" height="100%">
  <path d="M16 3 27.3 9.5v13L16 29 4.7 22.5v-13Z" stroke="${INK}" stroke-width="${simple ? 2.6 : 2.2}"/>
  ${simple ? '' : `<path d="M16 7.3 23.5 11.6v8.8L16 24.7l-7.5-4.3v-8.8Z M16 11.7 19.7 13.8v4.4L16 20.3l-3.7-2.1v-4.4Z" stroke="${INK}" stroke-width="1" opacity=".35"/>`}
  <path d="M16 3v26M4.7 9.5l22.6 13M27.3 9.5 4.7 22.5" stroke="${INK}" stroke-width="${simple ? 1.2 : 1}" opacity="${simple ? 0.4 : 0.35}"/>
  ${simple
    ? `<path d="M16 6.5 24 11.4 21.4 19.1 16 22.8 9.6 19.6 11 12.9Z" fill="${EMBER}" fill-opacity=".55" stroke="${EMBER}" stroke-width="2"/>`
    : `<path d="M16 5.5 24.5 11.1 21.8 19.4 16 23.6 9.4 19.8 11.2 13.2Z" fill="${EMBER}" fill-opacity=".45" stroke="${EMBER}" stroke-width="1.8"/>
       <g fill="${EMBER}"><circle cx="16" cy="5.5" r="1.6"/><circle cx="24.5" cy="11.1" r="1.6"/><circle cx="21.8" cy="19.4" r="1.6"/><circle cx="16" cy="23.6" r="1.6"/><circle cx="9.4" cy="19.8" r="1.6"/><circle cx="11.2" cy="13.2" r="1.6"/></g>`}
</svg>`

// An app icon: the mark on a dark rounded tile (the platforms round the corners themselves for touch icons).
const tile = (size, { simple = false, radius = 0.22, pad = 0.14 } = {}) => `
<html><body style="margin:0;background:transparent">
  <div style="width:${size}px;height:${size}px;background:${TILE};border-radius:${radius * 100}%;display:flex;align-items:center;justify-content:center">
    <div style="width:${size * (1 - pad * 2)}px;height:${size * (1 - pad * 2)}px">${mark(simple)}</div>
  </div>
</body></html>`

const og = `
<html><head><link href="https://fonts.googleapis.com/css2?family=Tektur:wght@500;900&family=Inter:wght@400&display=swap" rel="stylesheet"></head>
<body style="margin:0">
  <div style="width:1200px;height:630px;background:${TILE};color:${INK};padding:80px 90px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;font-family:Inter,sans-serif">
    <div style="font-size:30px;color:#a7b0c0">Practice real developer skills in short, game-like levels</div>
    <div style="display:flex;align-items:center;gap:36px">
      <div style="width:150px;height:150px">${mark()}</div>
      <div style="font-family:Tektur;font-weight:900;font-size:128px;letter-spacing:-0.01em;line-height:1">grind<span style="font-weight:500;color:${EMBER}">stone</span></div>
    </div>
    <div style="font-size:26px;color:#a7b0c0">First track: git · grindstone.dkiessling.de</div>
  </div>
</body></html>`

const browser = await chromium.launch()
const page = await browser.newPage()
const shot = async (html, width, height, file, transparent = true) => {
  await page.setViewportSize({ width, height })
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  return page.screenshot({ path: file && out(file), omitBackground: transparent, clip: { x: 0, y: 0, width, height } })
}

await shot(tile(180, { radius: 0, pad: 0.16 }), 180, 180, 'apple-touch-icon.png', false)
await shot(tile(192), 192, 192, 'icon-192.png')
await shot(tile(512), 512, 512, 'icon-512.png')
await shot(og, 1200, 630, 'og-image.png', false)

// favicon.ico: PNG images inside an ICO container (supported by every current browser)
const sizes = [16, 32, 48]
const pngs = []
for (const size of sizes) pngs.push(await shot(tile(size, { simple: size < 32, radius: 0.2, pad: size < 32 ? 0.06 : 0.1 }), size, size))
const header = Buffer.alloc(6 + 16 * sizes.length)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
sizes.forEach((size, i) => {
  const entry = 6 + 16 * i
  header.writeUInt8(size, entry)
  header.writeUInt8(size, entry + 1)
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(pngs[i].length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += pngs[i].length
})
writeFileSync(out('favicon.ico'), Buffer.concat([header, ...pngs]))

await browser.close()
console.log('Wrote favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, og-image.png')

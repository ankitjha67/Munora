// Render the source icon and a splash image for @capacitor/assets to slice into
// Android/iOS launcher icons and splash screens. Run: npm run mobile:assets
import sharp from 'sharp'
import fs from 'node:fs'

fs.mkdirSync('assets', { recursive: true })
const svg = fs.readFileSync('build/icon.svg')

// 1024 app icon
await sharp(svg, { density: 1024 }).resize(1024, 1024).png().toFile('assets/icon.png')

// 2732 splash: the mark centered on the brand indigo
const glyph = await sharp(svg, { density: 1024 }).resize(1000, 1000).png().toBuffer()
await sharp({ create: { width: 2732, height: 2732, channels: 4, background: '#4F46E5' } })
  .composite([{ input: glyph, gravity: 'center' }])
  .png()
  .toFile('assets/splash.png')

fs.copyFileSync('assets/splash.png', 'assets/splash-dark.png')
console.log('wrote assets/icon.png, assets/splash.png, assets/splash-dark.png')

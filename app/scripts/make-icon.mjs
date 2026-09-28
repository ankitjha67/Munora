// Rasterize the master SVG into the PNG that electron-builder turns into the
// Windows installer .ico. Run: npm run icon
import sharp from 'sharp'
import fs from 'node:fs'

const svg = fs.readFileSync('build/icon.svg')
await sharp(svg, { density: 512 }).resize(512, 512).png().toFile('build/icon.png')
console.log('wrote build/icon.png (512x512)')

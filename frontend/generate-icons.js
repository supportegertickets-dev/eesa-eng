/**
 * Generate PWA icons by resizing logo.png using sharp.
 * Run: npm install sharp --save-dev && node generate-icons.js
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const srcLogo = path.join(__dirname, 'public', 'logo.png');
const outDir = path.join(__dirname, 'public', 'icons');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function generateIcons() {
  for (const size of sizes) {
    await sharp(srcLogo)
      .resize(size, size)
      .png()
      .toFile(path.join(outDir, `icon-${size}x${size}.png`));
    console.log(`Created icon-${size}x${size}.png`);
  }
  console.log('Done');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err.message);
  process.exit(1);
});

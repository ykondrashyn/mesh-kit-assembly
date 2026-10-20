const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
async function render() {
  for (const name of fs.readdirSync(__dirname).filter(name => name.endsWith('.svg'))) {
    await sharp(path.join(__dirname, name), { density: 192 })
      .png()
      .toFile(path.join(__dirname, name.replace('.svg', '.png')))
  }
}
render().catch(error => { console.error(error.message); process.exitCode = 1 })

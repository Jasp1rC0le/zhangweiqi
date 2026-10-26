import { readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Tesseract requests exact language filenames. Ship them on our own origin;
// no CDN, proxy, arbitrary path read, or user document is involved.
export function localOcrAssets() {
  const assets = ['chi_sim', 'eng'].map((lang) => ({
    url: `/_ocr/7-1/${lang}.traineddata.gz`,
    path: fileURLToPath(
      new URL(
        `../node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
        import.meta.url,
      ),
    ),
  }))
  return {
    name: 'campthink-local-ocr-assets',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const asset = assets.find((a) => a.url === (req.url || '').split('?')[0])
        if (!asset || !['GET', 'HEAD'].includes(req.method)) return next()
        try {
          const info = await stat(asset.path)
          res.setHeader('Content-Type', 'application/octet-stream')
          res.setHeader('Content-Length', info.size)
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.setHeader('X-Content-Type-Options', 'nosniff')
          if (req.method === 'HEAD') res.end()
          else
            createReadStream(asset.path)
              .on('error', () => res.destroy())
              .pipe(res)
        } catch {
          res.statusCode = 503
          res.end('OCR language asset unavailable')
        }
      })
    },
    async generateBundle() {
      for (const asset of assets)
        this.emitFile({
          type: 'asset',
          fileName: asset.url.slice(1),
          source: await readFile(asset.path),
        })
      for (const [name,path] of [
        ['tesseract-LICENSE.md','tesseract.js/LICENSE.md'],
        ['tesseract-core-LICENSE.txt','tesseract.js-core/LICENSE'],
        ['chi_sim-package.json','@tesseract.js-data/chi_sim/package.json'],
        ['chi_sim-README.md','@tesseract.js-data/chi_sim/README.md'],
        ['eng-package.json','@tesseract.js-data/eng/package.json'],
        ['eng-README.md','@tesseract.js-data/eng/README.md'],
      ])this.emitFile({type:'asset',fileName:`_ocr/notices/${name}`,source:await readFile(new URL(`../node_modules/${path}`,import.meta.url))})
    },
  }
}

import Tesseract from 'tesseract.js/dist/tesseract.esm.min.js'
import workerPath from 'tesseract.js/dist/worker.min.js?url'
import corePath from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url'
let worker, initialization
async function initialize() {
  if (!initialization)
    initialization = (async () => {
      worker = await Tesseract.createWorker('chi_sim+eng', 1, {
        workerPath: new URL(workerPath, self.location.origin).href,
        corePath: new URL(corePath, self.location.origin).href,
        langPath: new URL('/_ocr/7-1', self.location.origin).href,
        workerBlobURL: false,
        cacheMethod: 'none',
        logger: (value) =>
          self.postMessage({
            progress: value.status === 'recognizing text' ? Math.round(value.progress * 100) : 0,
          }),
      })
    })()
  await initialization
}
self.onmessage = async ({ data }) => {
  try {
    await initialize()
    const result = await worker.recognize(data.image)
    self.postMessage({ id: data.id, text: result.data.text, confidence: result.data.confidence })
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message || '本机识字失败，请换清晰图片。' })
  }
}

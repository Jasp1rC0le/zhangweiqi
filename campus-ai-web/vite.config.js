import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { localOcrAssets } from './build/localOcrAssets.js'
import { uiRuntimeGroup } from './build/uiRuntimeChunks.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  cacheDir: 'node_modules/.vite-campthink',
  plugins: [vue(), localOcrAssets(), mode === 'development' && vueDevTools()].filter(Boolean),
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: [uiRuntimeGroup] } },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}))

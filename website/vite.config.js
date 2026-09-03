import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const websiteRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: websiteRoot,
  base: process.env.VITE_SITE_BASE || '/',
  server: {
    fs: {
      allow: [resolve(websiteRoot, '..')],
    },
  },
  build: {
    outDir: resolve(websiteRoot, '../website-dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: resolve(websiteRoot, 'index.html'),
        product: resolve(websiteRoot, 'product.html'),
        pricing: resolve(websiteRoot, 'pricing.html'),
        download: resolve(websiteRoot, 'download.html'),
        account: resolve(websiteRoot, 'account.html'),
        admin: resolve(websiteRoot, 'admin.html'),
        privacy: resolve(websiteRoot, 'privacy.html'),
        terms: resolve(websiteRoot, 'terms.html'),
        refunds: resolve(websiteRoot, 'refunds.html'),
        support: resolve(websiteRoot, 'support.html'),
      },
    },
  },
})

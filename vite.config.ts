import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

import pkg from './package.json'

// https://vitejs.dev/config/
// CSS is emitted as dist/sdmx-dashboard-components.css and imported by the
// consumer; injecting an `import './index.css'` into the bundle would make
// it unloadable in a plain Node.js process (server-side rendering)
export default defineConfig({
  plugins: [
    react()
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'lib/index.ts'),
      formats: ['es']
    },
    rollupOptions: {
      external: [ ...Object.keys(pkg.peerDependencies), /^highcharts\/modules\/.*/]
    },
    copyPublicDir: false
  }
})
